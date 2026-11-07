import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  FaAnchor,
  FaBars,
  FaHouse,
  FaMagnifyingGlass,
  FaRightToBracket,
  FaXmark,
} from "react-icons/fa6";

// Display responsive public navigation and keep its mobile menu easy to use.
function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const linkClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
      isActive
        ? "bg-blue-50 text-[#2B4593]"
        : "text-slate-600 hover:bg-slate-100 hover:text-[#2B4593]"
    }`;

  // Style for links inside the left slide-in menu.
  const drawerLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-colors duration-200 ${
      isActive
        ? "bg-blue-50 text-[#2B4593]"
        : "text-slate-700 hover:bg-slate-100 hover:text-[#2B4593]"
    }`;

  // Close the mobile menu after the visitor selects a destination.
  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <>
      <header className="relative z-30 border-b border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/[0.03] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-10">
          <Link
            to="/"
            onClick={closeMenu}
            className="group flex min-w-0 items-center gap-3"
            aria-label="Port Container Clearance Tracker home"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#172554] text-white shadow-md shadow-blue-950/15 transition duration-200 group-hover:bg-[#2B4593] sm:size-11">
              <FaAnchor className="text-lg" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold tracking-tight text-[#172554] sm:text-base">
                Port Clearance
              </span>
              <span className="hidden text-xs font-medium text-slate-500 sm:block">
                Container tracking
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            <NavLink to="/" end className={linkClass}>Home</NavLink>
            <NavLink to="/track" className={linkClass}>Track Container</NavLink>
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `ml-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#21377a] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-200 motion-reduce:transform-none motion-reduce:transition-none ${
                  isActive ? "bg-[#2B4593]" : "bg-[#172554]"
                }`
              }
            >
              Login
            </NavLink>
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-lg text-[#172554] transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100 md:hidden"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            {menuOpen ? <FaXmark /> : <FaBars />}
          </button>
        </div>
      </header>

      {/* Mobile menu: dimmed backdrop plus a panel that slides in from the left */}
      <div
        onClick={closeMenu}
        className={`fixed inset-0 z-40 bg-[#0b1738]/60 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none md:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
      />
      <nav
        id="mobile-navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col bg-white shadow-2xl shadow-slate-900/30 transition-[transform,visibility] duration-300 ease-out motion-reduce:transition-none md:hidden ${
          menuOpen ? "translate-x-0 visible" : "-translate-x-full invisible"
        }`}
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <Link to="/" onClick={closeMenu} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#172554] text-white">
              <FaAnchor />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-[#172554]">
              Port Clearance
            </span>
          </Link>
          <button
            type="button"
            onClick={closeMenu}
            className="flex size-10 items-center justify-center rounded-xl border border-slate-200 text-[#172554] transition hover:bg-blue-50"
            aria-label="Close navigation menu"
          >
            <FaXmark />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-5">
          <p className="px-4 pb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            Menu
          </p>
          <NavLink to="/" end onClick={closeMenu} className={drawerLinkClass}>
            <FaHouse className="text-base" /> Home
          </NavLink>
          <NavLink to="/track" onClick={closeMenu} className={drawerLinkClass}>
            <FaMagnifyingGlass className="text-base" /> Track Container
          </NavLink>
        </div>

        <div className="border-t border-slate-200 p-4">
          <NavLink
            to="/login"
            onClick={closeMenu}
            className={({ isActive }) =>
              `flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-colors ${
                isActive ? "bg-[#2B4593]" : "bg-[#172554] hover:bg-[#21377a]"
              }`
            }
          >
            <FaRightToBracket /> Login
          </NavLink>
          <p className="mt-3 text-center text-xs text-slate-400">
            Port Container Clearance Tracker
          </p>
        </div>
      </nav>
    </>
  );
}

export default SiteHeader;