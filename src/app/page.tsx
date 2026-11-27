"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RoomCategory = {
  id: string;
  name: string;
  gender_restriction: "male" | "female" | "any";
  capacity_per_room: number;
  total_rooms: number;
};

type CalendarDay = {
  date: string;
  rooms_left: number;
  status: "available" | "unavailable";
};

type CalendarCategory = {
  category_id: string;
  name: string;
  days: CalendarDay[];
};

type AvailabilityCategory = {
  category_id: string;
  name: string;
  rooms_left: number;
  rooms_needed: number;
  available: boolean;
};

type ReservationResponse = {
  reference_code: string;
  status: string;
  is_available: boolean;
};

type ReservationForm = {
  full_name: string;
  email: string;
  phone: string;
  category_id: string;
  arrival_date: string;
  departure_date: string;
  male_count: number;
  female_count: number;
  guest_notes: string;
};

const emptyForm: ReservationForm = {
  full_name: "",
  email: "",
  phone: "",
  category_id: "",
  arrival_date: "",
  departure_date: "",
  male_count: 0,
  female_count: 0,
  guest_notes: "",
};

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseError(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

export default function Home() {
  const [form, setForm] = useState<ReservationForm>(emptyForm);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [calendar, setCalendar] = useState<CalendarCategory[]>([]);
  const [calendarMonth, setCalendarMonth] = useState("2000-01");
  const [today, setToday] = useState("");
  const [availability, setAvailability] = useState<AvailabilityCategory | null>(
    null,
  );

  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ReservationResponse | null>(null);

  const guestCount = form.male_count + form.female_count;

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.category_id),
    [categories, form.category_id],
  );

  const calendarDays = useMemo(() => {
    return (
      calendar.find((item) => item.category_id === form.category_id)?.days ?? []
    );
  }, [calendar, form.category_id]);

  const calendarDaysByDate = useMemo(
    () => new Map(calendarDays.map((day) => [day.date, day])),
    [calendarDays],
  );

  const firstDayOffset = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const weekday = new Date(year, month - 1, 1).getDay();
    return (weekday + 6) % 7;
  }, [calendarMonth]);

  const daysInMonth = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    return new Date(year, month, 0).getDate();
  }, [calendarMonth]);

  const monthLabel = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, [calendarMonth]);

  const loadCalendar = useCallback(async () => {
    if (!calendarMonth) return;

    if (!form.category_id) {
      setCalendar([]);
      return;
    }

    setLoadingCalendar(true);

    try {
      const params = new URLSearchParams({
        month: calendarMonth,
        category_id: form.category_id,
      });

      const response = await fetch(`/api/availability/calendar?${params}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          parseError(payload, "Could not load the availability calendar."),
        );
      }

      setCalendar(payload.categories ?? []);
    } catch (err) {
      setCalendar([]);
      setError(
        err instanceof Error ? err.message : "Could not load the calendar.",
      );
    } finally {
      setLoadingCalendar(false);
    }
  }, [calendarMonth, form.category_id]);

  useEffect(() => {
    const now = new Date();

    setToday(localDateString(now));
    setCalendarMonth(monthString(now));
  }, []);

  useEffect(() => {
    async function loadCategories() {
      setLoadingCategories(true);

      try {
        const response = await fetch("/api/room-categories");
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            parseError(payload, "Could not load room categories."),
          );
        }

        const result = payload as RoomCategory[];
        setCategories(result);

        if (result.length > 0) {
          setForm((current) => ({
            ...current,
            category_id: current.category_id || result[0].id,
          }));
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load room categories.",
        );
      } finally {
        setLoadingCategories(false);
      }
    }

    void loadCategories();
  }, []);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    if (
      !form.category_id ||
      !form.arrival_date ||
      !form.departure_date ||
      form.departure_date <= form.arrival_date ||
      guestCount < 1
    ) {
      setAvailability(null);
      return;
    }

    const controller = new AbortController();

    async function checkAvailability() {
      setCheckingAvailability(true);

      try {
        const params = new URLSearchParams({
          arrival: form.arrival_date,
          departure: form.departure_date,
          category_id: form.category_id,
          guests: String(guestCount),
        });

        const response = await fetch(`/api/availability?${params}`, {
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(parseError(payload, "Could not check availability."));
        }

        const result = (payload.categories ?? []) as AvailabilityCategory[];
        setAvailability(result[0] ?? null);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setAvailability(null);
      } finally {
        if (!controller.signal.aborted) {
          setCheckingAvailability(false);
        }
      }
    }

    void checkAvailability();

    return () => controller.abort();
  }, [form.category_id, form.arrival_date, form.departure_date, guestCount]);

  function updateForm<K extends keyof ReservationForm>(
    key: K,
    value: ReservationForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setSuccess(null);
  }

  function chooseCalendarDate(date: string) {
    if (!today || date < today) return;

    setError("");
    setSuccess(null);

    if (
      !form.arrival_date ||
      form.departure_date ||
      date <= form.arrival_date
    ) {
      setForm((current) => ({
        ...current,
        arrival_date: date,
        departure_date: "",
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      departure_date: date,
    }));
  }

  function changeMonth(amount: number) {
    const [year, month] = calendarMonth.split("-").map(Number);
    const nextMonth = new Date(year, month - 1 + amount, 1);
    setCalendarMonth(monthString(nextMonth));
  }

  function validateForm(): string | null {
    if (!form.full_name.trim()) return "Please enter your full name.";
    if (!form.email.trim()) return "Please enter your email address.";
    if (!form.phone.trim()) return "Please enter your phone number.";
    if (!form.category_id) return "Please select a room category.";
    if (guestCount < 1) return "Please enter at least one guest.";

    if (!form.arrival_date || !form.departure_date) {
      return "Please select both arrival and departure dates.";
    }

    if (form.arrival_date < today) {
      return "Arrival cannot be in the past.";
    }

    if (form.departure_date <= form.arrival_date) {
      return "Departure must be after arrival.";
    }

    if (
      selectedCategory?.gender_restriction === "male" &&
      form.female_count > 0
    ) {
      return "This category is for men only. Please submit a separate request for women.";
    }

    if (
      selectedCategory?.gender_restriction === "female" &&
      form.male_count > 0
    ) {
      return "This category is for women only. Please submit a separate request for men.";
    }

    if (
      selectedCategory &&
      guestCount >
        selectedCategory.total_rooms * selectedCategory.capacity_per_room
    ) {
      return "The number of guests exceeds the maximum capacity of this category.";
    }

    return null;
  }

  async function submitReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!today) return;

    setError("");
    setSuccess(null);

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          guest_notes: form.guest_notes.trim(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          parseError(payload, "Could not submit your reservation."),
        );
      }

      setSuccess(payload as ReservationResponse);
      setForm(emptyForm);
      setAvailability(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not submit your reservation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const restrictionLabel = (
    restriction: RoomCategory["gender_restriction"],
  ) => {
    if (restriction === "male") return "Men";
    if (restriction === "female") return "Women";
    return "All guests";
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Temple Guest Rooms
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              Guest room reservation
            </h1>
          </div>

          <span className="hidden rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600 sm:inline">
            Buenos Aires, Argentina
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-7">
            <p className="text-sm font-medium text-amber-800">
              Reservation request
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              Tell us about your stay
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Complete the form to send your request. A request is not confirmed
              until it has been reviewed by temple staff.
            </p>
          </div>

          {success && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
            >
              <h3 className="font-semibold">Your request was submitted.</h3>
              <p className="mt-1">
                Reference code:{" "}
                <span className="font-bold">{success.reference_code}</span>
              </p>
              <p className="mt-1">
                Status: {success.status}. Please keep your reference code.
              </p>

              {!success.is_available && (
                <p className="mt-2">
                  The requested dates may not have enough rooms available. Staff
                  will review your request and may contact you with
                  alternatives.
                </p>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <form onSubmit={submitReservation} className="space-y-6">
            <fieldset className="space-y-4">
              <legend className="mb-3 text-base font-semibold">
                Contact information
              </legend>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Full name
                </span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  value={form.full_name}
                  onChange={(event) =>
                    updateForm("full_name", event.target.value)
                  }
                  className="form-input"
                  placeholder="Your full name"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">
                    Email address
                  </span>
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) =>
                      updateForm("email", event.target.value)
                    }
                    className="form-input"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">
                    Phone number
                  </span>
                  <input
                    required
                    type="tel"
                    minLength={5}
                    maxLength={30}
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) =>
                      updateForm("phone", event.target.value)
                    }
                    className="form-input"
                    placeholder="+54 ..."
                  />
                </label>
              </div>
            </fieldset>

            <div className="border-t border-stone-200 pt-6">
              <h3 className="mb-4 text-base font-semibold">Room and guests</h3>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Room category
                </span>
                <select
                  required
                  value={form.category_id}
                  onChange={(event) =>
                    updateForm("category_id", event.target.value)
                  }
                  className="form-input"
                  disabled={loadingCategories || categories.length === 0}
                >
                  {loadingCategories && (
                    <option value="">Loading categories…</option>
                  )}

                  {!loadingCategories && categories.length === 0 && (
                    <option value="">No room categories available</option>
                  )}

                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} —{" "}
                      {restrictionLabel(category.gender_restriction)}
                    </option>
                  ))}
                </select>

                {selectedCategory && (
                  <span className="mt-1.5 block text-xs text-stone-500">
                    Up to {selectedCategory.capacity_per_room} guests per room.
                  </span>
                )}
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Men</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={form.male_count}
                    onChange={(event) =>
                      updateForm(
                        "male_count",
                        Math.max(0, Number(event.target.value)),
                      )
                    }
                    className="form-input"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">
                    Women
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={form.female_count}
                    onChange={(event) =>
                      updateForm(
                        "female_count",
                        Math.max(0, Number(event.target.value)),
                      )
                    }
                    className="form-input"
                  />
                </label>
              </div>

              <p className="mt-2 text-sm text-stone-600">
                Total guests: <strong>{guestCount}</strong>
              </p>

              <p className="mt-1 text-xs text-stone-500">
                If your group needs both men’s and women’s rooms, submit a
                separate request for each category.
              </p>
            </div>

            <div className="border-t border-stone-200 pt-6">
              <h3 className="mb-4 text-base font-semibold">Dates of stay</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">
                    Arrival
                  </span>
                  <input
                    required
                    type="date"
                    min={today}
                    value={form.arrival_date}
                    onChange={(event) => {
                      updateForm("arrival_date", event.target.value);

                      if (
                        form.departure_date &&
                        event.target.value >= form.departure_date
                      ) {
                        updateForm("departure_date", "");
                      }
                    }}
                    className="form-input"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">
                    Departure
                  </span>
                  <input
                    required
                    type="date"
                    min={form.arrival_date || today}
                    value={form.departure_date}
                    onChange={(event) =>
                      updateForm("departure_date", event.target.value)
                    }
                    className="form-input"
                  />
                </label>
              </div>

              {checkingAvailability && (
                <p className="mt-3 text-sm text-stone-500">
                  Checking availability…
                </p>
              )}

              {!checkingAvailability && availability && (
                <div
                  className={`mt-3 rounded-lg p-3 text-sm ${
                    availability.available
                      ? "bg-green-50 text-green-800"
                      : "bg-amber-50 text-amber-900"
                  }`}
                  role="status"
                >
                  {availability.available
                    ? `${availability.rooms_left} room(s) available for the selected dates.`
                    : "There may not be enough rooms for the selected dates. You can still submit the request for staff review."}
                </div>
              )}
            </div>

            <label className="block border-t border-stone-200 pt-6">
              <span className="mb-1.5 block text-sm font-medium">
                Additional notes{" "}
                <span className="font-normal text-stone-500">(optional)</span>
              </span>
              <textarea
                rows={4}
                maxLength={500}
                value={form.guest_notes}
                onChange={(event) =>
                  updateForm("guest_notes", event.target.value)
                }
                className="form-input resize-y"
                placeholder="Share any information staff should know."
              />
              <span className="mt-1 block text-right text-xs text-stone-500">
                {form.guest_notes.length}/500
              </span>
            </label>

            <button
              type="submit"
              disabled={
                submitting || loadingCategories || categories.length === 0
              }
              className="w-full rounded-xl bg-amber-800 px-5 py-3.5 font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Submitting request…"
                : "Submit reservation request"}
            </button>
          </form>
        </section>

        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-800">Availability</p>
              <h2 className="mt-1 text-xl font-semibold">Choose your dates</h2>
            </div>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
                className="calendar-nav"
              >
                ‹
              </button>

              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
                className="calendar-nav"
              >
                ›
              </button>
            </div>
          </div>

          <p className="mt-4 text-center font-semibold">{monthLabel}</p>

          {!form.category_id && (
            <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
              Select a room category to view its availability.
            </p>
          )}

          {form.category_id && loadingCalendar && (
            <p className="mt-4 text-sm text-stone-500">Loading calendar…</p>
          )}

          {form.category_id && !loadingCalendar && (
            <div className="mt-4">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day) => (
                    <div key={day} className="py-2">
                      {day}
                    </div>
                  ),
                )}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOffset }).map((_, index) => (
                  <div key={`blank-${index}`} />
                ))}

                {Array.from({ length: daysInMonth }, (_, index) => {
                  const dayNumber = index + 1;
                  const date = `${calendarMonth}-${String(dayNumber).padStart(2, "0")}`;
                  const dayInfo = calendarDaysByDate.get(date);
                  const isPast = date < today;
                  const isArrival = form.arrival_date === date;
                  const isDeparture = form.departure_date === date;
                  const isSelected = isArrival || isDeparture;

                  const isInRange =
                    !!form.arrival_date &&
                    !!form.departure_date &&
                    date > form.arrival_date &&
                    date < form.departure_date;

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={isPast || !dayInfo}
                      onClick={() => chooseCalendarDate(date)}
                      title={
                        dayInfo
                          ? `${dayInfo.rooms_left} room(s) available`
                          : "Availability not loaded"
                      }
                      className={[
                        "calendar-day",
                        isSelected ? "calendar-day-selected" : "",
                        isInRange ? "calendar-day-range" : "",
                        dayInfo?.status === "unavailable"
                          ? "calendar-day-unavailable"
                          : "",
                        isPast || !dayInfo ? "calendar-day-disabled" : "",
                      ].join(" ")}
                    >
                      {dayNumber}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-green-200" />{" "}
                  Available
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-amber-200" /> Limited
                  / unavailable
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-amber-800" />{" "}
                  Selected
                </span>
              </div>

              <p className="mt-4 rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-600">
                Select an arrival date, then a departure date. The departure
                date is not counted as an overnight stay. Availability can
                change before staff approves the request.
              </p>
            </div>
          )}
        </aside>
      </div>

      <footer className="border-t border-stone-200 bg-white px-5 py-5 text-center text-xs text-stone-500">
        Temple Guest Room Reservation System
      </footer>
    </main>
  );
}
