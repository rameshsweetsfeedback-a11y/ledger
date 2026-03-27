import base64
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 8787
ALLOWED_MOBILE_NUMBER = "8006886802"
TWILIO_VERIFY_BASE_URL = "https://verify.twilio.com/v2"


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def normalized_e164(mobile_number: str) -> str:
    if mobile_number != ALLOWED_MOBILE_NUMBER:
        raise ValueError(f"Only {ALLOWED_MOBILE_NUMBER} is allowed for verification.")
    return f"+91{mobile_number}"


def twilio_auth_header() -> str:
    account_sid = env("TWILIO_ACCOUNT_SID")
    auth_token = env("TWILIO_AUTH_TOKEN")
    raw = f"{account_sid}:{auth_token}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def twilio_request(path: str, form_data: dict) -> dict:
    service_sid = env("TWILIO_VERIFY_SERVICE_SID")
    url = f"{TWILIO_VERIFY_BASE_URL}/Services/{service_sid}/{path}"
    payload = urlencode(form_data).encode("utf-8")
    request = Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": twilio_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
            message = parsed.get("message") or parsed.get("detail") or body
        except json.JSONDecodeError:
            message = body or f"Twilio request failed with status {error.code}."
        raise RuntimeError(message) from error
    except URLError as error:
        raise RuntimeError("Could not reach Twilio. Check your internet connection.") from error


class OtpHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        try:
            if self.path == "/send-otp":
                self.handle_send_otp()
                return

            if self.path == "/verify-otp":
                self.handle_verify_otp()
                return

            self.respond_json(404, {"message": "Not found."})
        except ValueError as error:
            self.respond_json(400, {"message": str(error)})
        except RuntimeError as error:
            self.respond_json(500, {"message": str(error)})

    def handle_send_otp(self):
        data = self.read_json_body()
        mobile_number = (data.get("mobile_number") or "").strip()
        if not mobile_number.isdigit() or len(mobile_number) != 10:
            raise ValueError("Enter a valid 10 digit mobile number.")

        recipient = normalized_e164(mobile_number)
        twilio_request("Verifications", {
            "To": recipient,
            "Channel": "sms",
        })
        self.respond_json(200, {
            "message": f"OTP sent successfully to {mobile_number}.",
        })

    def handle_verify_otp(self):
        data = self.read_json_body()
        mobile_number = (data.get("mobile_number") or "").strip()
        code = (data.get("code") or "").strip()
        if not mobile_number.isdigit() or len(mobile_number) != 10:
            raise ValueError("Enter a valid 10 digit mobile number.")
        if not code:
            raise ValueError("Enter the OTP.")

        recipient = normalized_e164(mobile_number)
        result = twilio_request("VerificationCheck", {
            "To": recipient,
            "Code": code,
        })
        verified = bool(result.get("valid")) and result.get("status") == "approved"
        self.respond_json(200, {
            "verified": verified,
            "message": "OTP verified successfully." if verified else "Incorrect OTP. Try again.",
        })

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError as error:
            raise ValueError("Invalid request body.") from error

    def respond_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    print(f"OTP server listening on http://{HOST}:{PORT}")
    server = ThreadingHTTPServer((HOST, PORT), OtpHandler)
    server.serve_forever()
