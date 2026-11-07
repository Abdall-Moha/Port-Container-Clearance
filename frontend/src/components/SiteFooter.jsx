import { Link } from "react-router-dom";
import { FaAnchor, FaArrowRight, FaLocationDot } from "react-icons/fa6";

// Footer navigation links shown in the "Quick links" column.
const footerLinks = [
  { label: "Home", to: "/" },
  { label: "Track Container", to: "/track" },
  { label: "Staff Login", to: "/login" },
];

// Ports covered by the platform, shown in the "Ports" column.
const footerPorts = ["Mogadishu Port", "Berbera Port", "Bosaso Port", "Kismayo Port"];

// Show the public navigation and project summary in a responsive dark footer.
function SiteFooter() {
  return (
    <footer className="bg-[#172554] text-white">
      <div className="mx-auto max-w-7xl px-5 pb-6 pt-12 sm:px-8 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr] lg:gap-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              to="/"
              className="inline-flex items-center gap-3 font-extrabold tracking-tight text-white transition-colors hover:text-blue-200"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-lg text-blue-200">
                <FaAnchor />
              </span>
              Port Container Clearance Tracker
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-blue-100/75">
              Follow recorded container clearance milestones from arrival
              through collection.
            </p>
          </div>

          <nav aria-label="Footer navigation">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-200">
              Quick links
            </h2>
            <ul className="mt-4 space-y-3 text-sm font-semibold text-blue-100">
              {footerLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    className="group inline-flex items-center gap-2 transition-colors hover:text-white"
                    to={link.to}
                  >
                    {link.label}
                    <FaArrowRight className="text-[10px] opacity-0 transition duration-200 group-hover:translate-x-1 group-hover:opacity-100 motion-reduce:transition-none" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-200">
              Ports
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-blue-100/85">
              {footerPorts.map((port) => (
                <li key={port} className="flex items-center gap-2">
                  <FaLocationDot className="text-xs text-sky-300" />
                  {port}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:col-span-2 lg:col-span-1">
            <h2 className="font-extrabold text-white">Check a container</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100/75">
              Enter a container number to see its latest clearance stage.
            </p>
            <Link
              to="/track"
              className="group mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-extrabold text-[#172554] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 motion-reduce:transform-none motion-reduce:transition-none"
            >
              Track now
              <FaArrowRight className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
            </Link>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-blue-100/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Port Container Clearance Tracker. All rights reserved.</p>
          <p>Public tracking shows clearance progress only.</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;