import { useState } from "react";
import { Link } from "react-router-dom";
import { FaAnchor, FaEye, FaEyeSlash } from "react-icons/fa6";
import api from "../config/api.js";

// Sign in with the email and password accepted by the backend login endpoint.
function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Validate credentials and submit them to the real backend login route.
  async function handleSubmit(event) {
    event.preventDefault();
    if (isLoading) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setErrorMessage("Enter a valid email address.");
      setSuccessMessage("");
      return;
    }
    if (!password) {
      setErrorMessage("Enter your password.");
      setSuccessMessage("");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await api.post("/users/login", {
        email: cleanEmail,
        password,
      });

      // The token is intentionally not persisted because session handling is not part of this phase.
      setSuccessMessage(response.data?.message || "Login successful.");
      setPassword("");
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to sign in right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-2">
        {/* Left side: simple image panel */}
        <div className="relative hidden min-h-[500px] md:block">
          <img
            src="/Container.jpg"
            alt="Shipping containers at a port"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[#172554]/80" />
          <div className="relative flex h-full flex-col justify-between p-8 text-white lg:p-10">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/15 text-xl">
              <FaAnchor />
            </span>
            <div>
              <h1 className="text-3xl font-black leading-tight lg:text-4xl">
                Port Container Clearance Tracker
              </h1>
              <p className="mt-3 text-sm leading-6 text-blue-100">
                Sign in with your registered account to access the tools
                available for your role.
              </p>
            </div>
          </div>
        </div>

        {/* Right side: simple form */}
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Sign in</h2>
          <p className="mt-2 text-sm text-slate-600">Use the email and password registered with the system.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-bold text-slate-700">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-bold text-slate-700">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-blue-700 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            {errorMessage && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">{errorMessage}</p>}
            {successMessage && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">{successMessage}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-700 px-5 py-3 font-extrabold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Need to check a container?{" "}
            <Link className="font-bold text-blue-700 hover:text-blue-900" to="/track">Track it publicly</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;