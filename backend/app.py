from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from datetime import datetime, timedelta
import requests  
import random
import os



from data_utils import fetch_stock_data, prepare_lstm_data, make_future_predictions
from model import train_and_save_model, load_lstm_model, MODEL_PATH

# >>> put your API key here <<<
FAST2SMS_API_KEY = "U3LZT4VnSztEOJIi8hk1uacDrge9bsfXoxqmWBH5wvQ7pyGNd0HQCw40ght1WNk8BsebD5I6GX3pxRZo"

app = Flask(__name__)
CORS(app)

# JWT configuration
app.config["JWT_SECRET_KEY"] = "super-secret-key-change-this"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=2)
jwt = JWTManager(app)

# Simple in‑memory OTP store (phone -> {code, expires_at})
otp_store = {}
OTP_EXP_MINUTES = 5
TIME_STEPS = 60


# --------- SMS SENDER (stub – fill with real provider) -----------------

def send_sms(phone_number: str, message: str):
    """
    Send SMS via Fast2SMS OTP/Transactional API to Indian numbers.
    phone_number must be a 10-digit Indian mobile number without +91.
    """
    # Strip any spaces and +91 if the user typed it
    phone_clean = phone_number.replace(" ", "").replace("+91", "")
    if phone_clean.startswith("0"):
        phone_clean = phone_clean[1:]

    url = "https://www.fast2sms.com/dev/bulkV2"

    payload = {
        "route": "v3",            # use the route your account supports (OTP/Transactional)
        "sender_id": "TXTIND",    # or your approved sender id, if required
        "message": message,
        "language": "english",
        "flash": "0",
        "numbers": phone_clean,
    }

    headers = {
        "authorization": FAST2SMS_API_KEY,
        "Content-Type": "application/json"
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=10)
    data = resp.json()
    # Basic check – adapt based on Fast2SMS response format
    if resp.status_code != 200 or not data.get("return"):
        raise Exception(f"Fast2SMS error: {data}")


# --------- OTP endpoints -----------------------------------------------

@app.route("/api/send-otp", methods=["POST"])
def send_otp():
    data = request.get_json()
    phone = data.get("phone")
    if not phone:
        return jsonify({"error": "Phone is required"}), 400

    code = f"{random.randint(1000, 9999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXP_MINUTES)
    otp_store[phone] = {"code": code, "expires_at": expires_at}

    send_sms(
        phone,
        f"Your StockVision AI login OTP is {code}. It is valid for {OTP_EXP_MINUTES} minutes."
    )

    return jsonify({"message": "OTP sent"}), 200


@app.route("/api/verify-otp", methods=["POST"])
def verify_otp():
    data = request.get_json()
    phone = data.get("phone")
    code = data.get("otp")

    record = otp_store.get(phone)
    if not record:
        return jsonify({"error": "No OTP requested for this number"}), 400

    if datetime.utcnow() > record["expires_at"]:
        return jsonify({"error": "OTP expired"}), 400

    if code != record["code"]:
        return jsonify({"error": "Invalid OTP"}), 400

    access_token = create_access_token(identity=phone)
    del otp_store[phone]

    return jsonify({"access_token": access_token}), 200


# --------- Helper to ensure LSTM model exists --------------------------

def ensure_model_trained(df):
    if os.path.exists(MODEL_PATH):
        return load_lstm_model()
    X, y, _, _ = prepare_lstm_data(df, time_steps=TIME_STEPS)
    model = train_and_save_model(X, y, epochs=10, batch_size=32)
    return model


# --------- Protected prediction endpoint -------------------------------

@app.route("/api/predict", methods=["POST"])
@jwt_required()
def predict():
    _phone = get_jwt_identity()  # available if needed

    data = request.get_json()
    symbol = data.get("symbol", "AAPL").upper()
    start = data.get("startDate")
    end = data.get("endDate")
    horizon = int(data.get("horizon", 14))

    try:
        df = fetch_stock_data(symbol, start, end)
        model = ensure_model_trained(df)

        # prepare scaled data and make future predictions
        _, _, scaler, scaled = prepare_lstm_data(df, time_steps=TIME_STEPS)
        preds = make_future_predictions(
            model, scaled[:, 0], scaler, horizon, TIME_STEPS
        )

        # build history list
        history = [
            {"date": d.strftime("%Y-%m-%d"), "close": float(c)}
            for d, c in zip(df.index, df["Close"].values)
        ]

        last_date = df.index[-1]
        pred_points = []
        for i, p in enumerate(preds, 1):
            d = last_date + timedelta(days=i)
            band = p * 0.04
            pred_points.append(
                {
                    "date": d.strftime("%Y-%m-%d"),
                    "pred": float(p),
                    "lower": float(p - band),
                    "upper": float(p + band),
                }
            )

        return jsonify({"history": history, "preds": pred_points})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
  app.run(debug=True)
