import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext.jsx";
import {
  FaArrowRight,
  FaBoxesStacked,
  FaCalculator,
  FaCircleCheck,
  FaClipboardCheck,
  FaClock,
  FaCreditCard,
  FaFileCircleCheck,
  FaLocationDot,
  FaMagnifyingGlass,
  FaShip,
  FaTruck,
  FaUnlock,
} from "react-icons/fa6";

const clearanceStages = [
  {
    title: "ARRIVED",
    description:
      "The container reaches the port and its clearance record is created.",
    icon: FaShip,
  },
  {
    title: "DOCUMENTS SUBMITTED",
    description: "The required shipping documents are submitted for review.",
    icon: FaFileCircleCheck,
  },
  {
    title: "CUSTOMS REVIEW",
    description: "Customs officers examine the submitted documents.",
    icon: FaMagnifyingGlass,
  },
  {
    title: "DUTY ASSESSED",
    description: "Applicable customs duties and port charges are assessed.",
    icon: FaCalculator,
  },
  {
    title: "DUTY PAID",
    description: "The required duty payment is successfully completed.",
    icon: FaCreditCard,
  },
  {
    title: "INSPECTION",
    description: "The container undergoes the required physical inspection.",
    icon: FaClipboardCheck,
  },
  {
    title: "RELEASED",
    description:
      "The container receives clearance and is authorized for release.",
    icon: FaUnlock,
  },
  {
    title: "COLLECTED",
    description: "The container leaves the port after collection is completed.",
    icon: FaTruck,
  },
];

// Sample milestones used only by the decorative preview card in the hero.
const previewMilestones = [
  { title: "Duty paid", time: "Today · 10:42", done: true },
  { title: "Duty assessed", time: "Today · 09:15", done: true },
  { title: "Customs review", time: "Yesterday · 16:30", done: true },
];

// Present the public purpose and clearance stages of the tracker.
function HomePage() {
  const { t } = useLanguage();
  return (
    <>
      {/* Keyframes used only by the hero animations; all are disabled for reduced motion. */}
      <style>{`
        @keyframes hero-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hero-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes hero-zoom {
          from { transform: scale(1); }
          to { transform: scale(1.06); }
        }
        @keyframes hero-fill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .hero-fade-up { opacity: 0; animation: hero-fade-up 0.8s ease-out forwards; }
        .hero-float { animation: hero-float 6s ease-in-out infinite; }
        .hero-zoom { animation: hero-zoom 24s ease-in-out infinite alternate; }
        .hero-fill { transform-origin: left; animation: hero-fill 1.2s ease-out 0.6s both; }
        @media (prefers-reduced-motion: reduce) {
          .hero-fade-up { opacity: 1; animation: none; }
          .hero-float, .hero-zoom, .hero-fill { animation: none; }
        }
      `}</style>

      {/* Hero: soft container background, short copy, and a sample tracking card */}
      <section className="relative isolate overflow-hidden bg-[#0b1738] text-white">
        <img
          src="/Container.jpg"
          alt=""
          aria-hidden="true"
          className="hero-zoom absolute inset-0 -z-30 h-full w-full object-cover object-center opacity-50"
        />
        <div className="absolute inset-0 -z-20 bg-gradient-to-r from-[#0b1738]/95 via-[#0b1738]/75 to-[#172554]/50" />
        <div className="absolute inset-0 -z-20 bg-gradient-to-t from-[#0b1738]/80 via-transparent to-transparent" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:pb-32 lg:pt-24">
          <div className="max-w-xl">
            <div
              className="hero-fade-up inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-100 backdrop-blur"
              style={{ animationDelay: "0.05s" }}
            >
              <span className="size-2 rounded-full bg-emerald-400" />
              {t("Port container clearance")}
            </div>

            <h1
              className="hero-fade-up mt-6 text-[2.5rem] font-black leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-[3.5rem]"
              style={{ animationDelay: "0.15s" }}
            >
              {t("Your container's journey,")}{" "}
              <span className="text-sky-300">{t("clearly tracked.")}</span>
            </h1>

            <p
              className="hero-fade-up mt-5 text-base leading-7 text-blue-100/85 sm:text-lg sm:leading-8"
              style={{ animationDelay: "0.3s" }}
            >
              {t(
                "Follow container clearance from arrival through collection. Check the current stage and completed milestones with a container number.",
              )}
            </p>

            <div
              className="hero-fade-up mt-8 flex flex-col gap-3 sm:flex-row"
              style={{ animationDelay: "0.45s" }}
            >
              <Link
                to="/track"
                className="group inline-flex items-center justify-center gap-2.5 rounded-xl bg-white px-6 py-3.5 text-sm font-extrabold text-[#172554] shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-white/30 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {t("Track Your Container")}{" "}
                <FaArrowRight className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/20 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {t("Staff Login")}
              </Link>
            </div>
          </div>

          {/* Decorative sample card: shows what a tracking result looks like, not live data */}
          <div
            className="hero-fade-up relative mx-auto w-full max-w-md lg:max-w-none lg:justify-self-end"
            style={{ animationDelay: "0.4s" }}
          >
            <div className="hero-float relative rounded-2xl border border-white/15 bg-white/10 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6 lg:max-w-[440px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-200/80">
                    {t("Sample tracking result")}
                  </p>
                  <p className="mt-1.5 font-mono text-xl font-bold tracking-wider text-white sm:text-2xl">
                    MSCU 123456 6
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-blue-100/80">
                    <FaLocationDot className="text-sky-300" /> Mogadishu Port
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-300/30">
                  {t("Duty paid")}
                </span>
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-blue-100/80">
                  <span>{t("Clearance progress")}</span>
                  <span>{t("Stage 5 of 8")}</span>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {clearanceStages.map((stage, index) => (
                    <span
                      key={stage.title}
                      className="relative h-2 overflow-hidden rounded-full bg-white/15"
                    >
                      {index < 5 && (
                        <span
                          className="hero-fill absolute inset-0 rounded-full bg-gradient-to-r from-sky-300 to-blue-400"
                          style={{ animationDelay: `${0.6 + index * 0.12}s` }}
                        />
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <ul className="mt-6 space-y-3">
                {previewMilestones.map((item) => (
                  <li key={item.title} className="flex items-center gap-3">
                    <FaCircleCheck className="shrink-0 text-lg text-emerald-300" />
                    <span className="flex-1 text-sm font-bold text-white">
                      {t(item.title)}
                    </span>
                    <span className="text-xs text-blue-100/70">
                      {item.time}
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-3">
                  <span className="flex size-[18px] shrink-0 items-center justify-center">
                    <span className="size-3 rounded-full border-2 border-dashed border-blue-200/70" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-blue-100/80">
                    {t("Inspection")}
                  </span>
                  <span className="text-xs text-blue-100/60">
                    {t("Up next")}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Curved edge into the next section */}
        <svg
          className="absolute bottom-0 left-0 w-full text-white"
          viewBox="0 0 1440 48"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M0 48h1440V20C1200 -4 960 -4 720 20S240 44 0 20z"
          />
        </svg>
      </section>

      <section className="bg-white py-14 sm:py-18 lg:py-22">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <SectionHeading
            eyebrow={t("A clear process")}
            title={t("How container clearance moves forward")}
            text={t(
              "Follow each recorded milestone as a container moves through the clearance workflow.",
            )}
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <ProcessCard
              icon={<FaBoxesStacked />}
              number="01"
              title={t("Container arrives")}
              text={t(
                "The container is registered and its clearance progress begins at the port.",
              )}
            />
            <ProcessCard
              icon={<FaFileCircleCheck />}
              number="02"
              title={t("Documents and duty")}
              text={t(
                "Required documents are reviewed, then applicable duty is assessed and paid.",
              )}
            />
            <ProcessCard
              icon={<FaClipboardCheck />}
              number="03"
              title={t("Inspection and collection")}
              text={t(
                "The container proceeds through inspection, release, and final collection.",
              )}
            />
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-slate-50 to-white py-14 sm:py-18 lg:py-22">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2B4593]">
                {t("Clearance timeline")}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#172554] sm:text-4xl">
                {t("Eight stages. One clear view.")}
              </h2>
            </div>
            <Link
              to="/track"
              className="group inline-flex w-fit items-center gap-2 text-sm font-extrabold text-[#2B4593] transition-colors hover:text-blue-950"
            >
              {t("Look up a container")}{" "}
              <FaArrowRight className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
            </Link>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {clearanceStages.map((stage, index) => {
              const StageIcon = stage.icon;
              return (
                <li
                  key={stage.title}
                  className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-900/[0.035] transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/[0.08] motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-lg text-[#2B4593] transition duration-200 group-hover:bg-[#2B4593] group-hover:text-white motion-reduce:transition-none">
                      <StageIcon />
                    </span>
                    <span className="text-xs font-black tracking-[0.14em] text-slate-300">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold leading-5 tracking-wide text-[#172554]">
                    {t(stage.title)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t(stage.description)}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Built for visibility: compact banner with a heading row and three benefits in a row */}
      <section className="px-5 pb-14 sm:px-8 sm:pb-18 lg:px-10 lg:pb-22">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-[#172554] shadow-lg shadow-blue-950/10">
          <div className="flex flex-col gap-5 p-6 sm:p-8 md:flex-row md:items-center md:justify-between lg:px-10">
            <div className="max-w-xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-200">
                {t("Built for visibility")}
              </p>
              <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
                {t("Stay informed at every step.")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-blue-100/80">
                {t(
                  "Use the public tracking page to see the latest recorded stage and when completed milestones were recorded.",
                )}
              </p>
            </div>
            <Link
              to="/track"
              className="group inline-flex w-fit shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-extrabold text-[#172554] transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 motion-reduce:transform-none motion-reduce:transition-none"
            >
              {t("Start tracking")}{" "}
              <FaArrowRight className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
            </Link>
          </div>
          <div className="grid gap-px border-t border-white/10 bg-white/10 md:grid-cols-3">
            <BenefitCard
              icon={<FaMagnifyingGlass />}
              title={t("Simple lookup")}
              text={t(
                "Enter a container number to view its clearance progress.",
              )}
            />
            <BenefitCard
              icon={<FaClock />}
              title={t("Milestone times")}
              text={t("See the date and time recorded for completed stages.")}
            />
            <BenefitCard
              icon={<FaClipboardCheck />}
              title={t("Process visibility")}
              text={t(
                "Understand what stage comes next in the clearance sequence.",
              )}
            />
          </div>
        </div>
      </section>
    </>
  );
}

// Keep section introductions consistent without hiding their supporting text.
function SectionHeading({ eyebrow, title, text }) {
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2B4593]">
        {t(eyebrow)}
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-[#172554] sm:text-4xl">
        {t(title)}
      </h2>
      <p className="mt-4 leading-7 text-slate-600">{t(text)}</p>
    </div>
  );
}

// Show one step in the clearance overview with a small hover emphasis.
function ProcessCard({ icon, number, title, text }) {
  const { t } = useLanguage();
  return (
    <article className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm shadow-slate-900/[0.04] transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/[0.08] motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-center justify-between">
        <span className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-xl text-[#2B4593] transition duration-200 group-hover:bg-[#2B4593] group-hover:text-white motion-reduce:transition-none">
          {icon}
        </span>
        <span className="text-xs font-black tracking-[0.16em] text-slate-300">
          {t("STEP")} {number}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-extrabold text-[#172554]">{t(title)}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{t(text)}</p>
    </article>
  );
}

// Show one public tracking benefit as a compact icon-and-text row.
function BenefitCard({ icon, title, text }) {
  const { t } = useLanguage();
  return (
    <article className="group flex items-start gap-4 bg-[#172554] p-5 transition duration-200 hover:bg-[#1c2d66] motion-reduce:transition-none sm:p-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-base text-blue-200 transition-colors group-hover:bg-white group-hover:text-[#2B4593]">
        {icon}
      </span>
      <div>
        <h3 className="font-extrabold text-white">{t(title)}</h3>
        <p className="mt-1 text-sm leading-6 text-blue-100/75">{t(text)}</p>
      </div>
    </article>
  );
}

export default HomePage;
