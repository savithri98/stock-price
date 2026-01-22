import os
import numpy as np
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

MODEL_PATH = os.path.join(os.path.dirname(__file__), "saved_models", "lstm_model.h5")

def build_lstm_model(time_steps: int = 60):
    model = Sequential()
    model.add(LSTM(64, return_sequences=True, input_shape=(time_steps, 1)))
    model.add(Dropout(0.2))
    model.add(LSTM(64))
    model.add(Dropout(0.2))
    model.add(Dense(1))
    model.compile(optimizer="adam", loss="mse")
    return model

def train_and_save_model(X, y, epochs=20, batch_size=32):
    model = build_lstm_model(time_steps=X.shape[1])
    es = EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True)
    model.fit(
        X,
        y,
        epochs=epochs,
        batch_size=batch_size,
        validation_split=0.1,
        callbacks=[es],
        verbose=1,
    )
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    model.save(MODEL_PATH)
    return model

def load_lstm_model():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError("Model not trained yet.")
    return load_model(MODEL_PATH)
