import yfinance as yf
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

scaler = MinMaxScaler(feature_range=(0, 1))

def fetch_stock_data(symbol: str, start: str, end: str):
    df = yf.download(symbol, start=start, end=end)
    if df.empty:
        raise ValueError("No data found for given symbol/dates")
    df = df[["Close"]].dropna()
    return df  # index = Date, column = Close

def prepare_lstm_data(df: pd.DataFrame, time_steps: int = 60):
    close_values = df["Close"].values.reshape(-1, 1)
    scaled = scaler.fit_transform(close_values)

    X, y = [], []
    for i in range(time_steps, len(scaled)):
        X.append(scaled[i - time_steps:i, 0])
        y.append(scaled[i, 0])

    X, y = np.array(X), np.array(y)
    X = X.reshape((X.shape[0], X.shape[1], 1))  # [samples, timesteps, features]
    return X, y, scaler, scaled

def make_future_predictions(model, scaled_series, scaler, days: int, time_steps: int = 60):
    # scaled_series: whole close series scaled (1D array)
    seq = scaled_series[-time_steps:].reshape(1, time_steps, 1)
    preds = []
    for _ in range(days):
        next_scaled = model.predict(seq, verbose=0)[0, 0]
        preds.append(next_scaled)
        seq = np.append(seq[:, 1:, :], [[[next_scaled]]], axis=1)
    preds = np.array(preds).reshape(-1, 1)
    preds_inv = scaler.inverse_transform(preds).flatten()
    return preds_inv

def make_arima_predictions(df: pd.DataFrame, days: int, order=(5,1,0)):
    from statsmodels.tsa.arima.model import ARIMA
    history = df["Close"].values
    try:
        model = ARIMA(history, order=order)
        model_fit = model.fit()
        forecast = model_fit.forecast(steps=days)
        return forecast.tolist()
    except Exception as e:
        print("ARIMA Error:", e)
        return [history[-1]] * days
