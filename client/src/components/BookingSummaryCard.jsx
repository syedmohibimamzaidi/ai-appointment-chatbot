import {
  Scissors,
  CalendarDays,
  Clock3,
  User,
  CheckCircle2,
} from "lucide-react";

export default function BookingSummaryCard({ draft, confirmed = false }) {
  const rows = [
    { Icon: Scissors, label: "Service", value: draft.service },
    { Icon: CalendarDays, label: "Date", value: draft.date },
    { Icon: Clock3, label: "Time", value: draft.time },
    { Icon: User, label: "Name", value: draft.name },
  ];

  const title = confirmed ? "Appointment Confirmed" : "Booking Summary";

  return (
    <div className="booking-card">
      <div className="booking-card__header">
        <span className="booking-card__dot" aria-hidden="true" />
        <span className="booking-card__title">{title}</span>
      </div>

      <div className="booking-card__grid">
        {rows.map((row) => (
          <div className="booking-card__item" key={row.label}>
            <span className="booking-card__icon" aria-hidden="true">
              <row.Icon size={15} strokeWidth={1.75} />
            </span>
            <div className="booking-card__text">
              <div className="booking-card__label">{row.label}</div>
              <div className="booking-card__value">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {confirmed ? (
        <div className="booking-card__hint booking-card__hint--success">
          <CheckCircle2
            className="booking-card__check"
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
          We'll see you then.
        </div>
      ) : (
        <div className="booking-card__hint">
          Reply <span className="booking-card__kbd">yes</span> to confirm or{" "}
          <span className="booking-card__kbd">no</span> to cancel.
        </div>
      )}
    </div>
  );
}
