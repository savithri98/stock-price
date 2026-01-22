document.addEventListener("DOMContentLoaded", () => {
  const phoneInput = document.getElementById("phoneInput");
  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");
  const otpInputs = document.querySelectorAll(".otp-input");
  const statusEl = document.getElementById("loginStatus");

  function getOtpValue() {
    return Array.from(otpInputs)
      .map((i) => i.value.trim())
      .join("");
  }

  sendOtpBtn.addEventListener("click", async () => {
    const phone = phoneInput.value.trim();
    if (!phone || phone.length < 8) {
      statusEl.textContent = "Enter a valid mobile number.";
      statusEl.style.color = "var(--danger)";
      return;
    }
    statusEl.textContent = "Sending OTP...";
    statusEl.style.color = "var(--muted)";

    try {
      const res = await fetch("http://127.0.0.1:5000/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");
      statusEl.textContent = "OTP sent. Please check your phone.";
      statusEl.style.color = "var(--success)";
      otpInputs.forEach((i) => (i.value = ""));
      otpInputs[0].focus();
    } catch (e) {
      console.error(e);
      statusEl.textContent = e.message || "Error sending OTP.";
      statusEl.style.color = "var(--danger)";
    }
  });

  otpInputs.forEach((input, idx) => {
    input.addEventListener("input", () => {
      if (input.value.length === 1 && idx < otpInputs.length - 1) {
        otpInputs[idx + 1].focus();
      }
    });
  });

  verifyOtpBtn.addEventListener("click", async () => {
    const phone = phoneInput.value.trim();
    const otp = getOtpValue();
    if (!phone) {
      statusEl.textContent = "Enter your mobile number.";
      statusEl.style.color = "var(--danger)";
      return;
    }
    if (otp.length < 4) {
      statusEl.textContent = "Enter the 4‑digit OTP.";
      statusEl.style.color = "var(--danger)";
      return;
    }

    statusEl.textContent = "Verifying OTP...";
    statusEl.style.color = "var(--muted)";

    try {
      const res = await fetch("http://127.0.0.1:5000/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        throw new Error(data.error || "OTP verification failed");
      }

      // store JWT
      localStorage.setItem("sv_access_token", data.access_token);
      statusEl.textContent = "OTP verified. Redirecting to dashboard...";
      statusEl.style.color = "var(--success)";
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 800);
    } catch (e) {
      console.error(e);
      statusEl.textContent = e.message || "Error verifying OTP.";
      statusEl.style.color = "var(--danger)";
    }
  });
});
