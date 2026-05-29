import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Demographics } from "../types";
import styles from "./DemographicsForm.module.css";

interface Props {
  // Optional starting values — used to pre-fill the form for the same
  // participant's next day.
  initial?: Demographics;
  onSubmit: (data: Demographics) => void;
}

const blank: Demographics = {
  participant_id: "",
  day: "1",
  age: "",
  gender: "",
  dominant_hand: "",
  dominant_eye: "",
  glasses_or_contacts: "",
  prior_eye_tracking_experience: "",
  prior_xr_experience: "",
  typing_experience: "",
  notes: "",
};

export function DemographicsForm({ initial, onSubmit }: Props) {
  const [data, setData] = useState<Demographics>(initial ?? blank);

  const update =
    (k: keyof Demographics) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setData((d) => ({ ...d, [k]: e.target.value }));
    };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!data.participant_id.trim()) {
      alert("participant_id is required.");
      return;
    }
    onSubmit(data);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <h2>Participant Information</h2>
      <p className={styles.hint}>
        participant_id is required and is normalized to P01, P02, … (e.g. typing
        “3” becomes P03). Select which day of the 3-day study this run is. Each
        day runs one practice session and five experiment sessions.
      </p>

      <label>
        Participant ID *
        <input value={data.participant_id} onChange={update("participant_id")} placeholder="e.g. 3 → P03" required />
      </label>

      <label>
        Day
        <select value={data.day} onChange={update("day")}>
          <option value="1">Day 1</option>
          <option value="2">Day 2</option>
          <option value="3">Day 3</option>
        </select>
      </label>

      <label>
        Age
        <input value={data.age} onChange={update("age")} placeholder="e.g. 24" />
      </label>

      <label>
        Gender
        <select value={data.gender} onChange={update("gender")}>
          <option value="">--</option>
          <option value="female">female</option>
          <option value="male">male</option>
          <option value="nonbinary">nonbinary</option>
          <option value="prefer_not_to_say">prefer not to say</option>
        </select>
      </label>

      <label>
        Dominant hand
        <select value={data.dominant_hand} onChange={update("dominant_hand")}>
          <option value="">--</option>
          <option value="right">right</option>
          <option value="left">left</option>
          <option value="ambidextrous">ambidextrous</option>
        </select>
      </label>

      <label>
        Dominant eye
        <select value={data.dominant_eye} onChange={update("dominant_eye")}>
          <option value="">--</option>
          <option value="right">right</option>
          <option value="left">left</option>
          <option value="unknown">unknown</option>
        </select>
      </label>

      <label>
        Glasses or contacts
        <select value={data.glasses_or_contacts} onChange={update("glasses_or_contacts")}>
          <option value="">--</option>
          <option value="none">none</option>
          <option value="glasses">glasses</option>
          <option value="contacts">contacts</option>
        </select>
      </label>

      <label>
        Prior eye-tracking experience
        <select value={data.prior_eye_tracking_experience} onChange={update("prior_eye_tracking_experience")}>
          <option value="">--</option>
          <option value="none">none</option>
          <option value="some">some</option>
          <option value="extensive">extensive</option>
        </select>
      </label>

      <label>
        Prior XR experience
        <select value={data.prior_xr_experience} onChange={update("prior_xr_experience")}>
          <option value="">--</option>
          <option value="none">none</option>
          <option value="some">some</option>
          <option value="extensive">extensive</option>
        </select>
      </label>

      <label>
        Typing experience
        <select value={data.typing_experience} onChange={update("typing_experience")}>
          <option value="">--</option>
          <option value="beginner">beginner</option>
          <option value="intermediate">intermediate</option>
          <option value="advanced">advanced</option>
          <option value="expert">expert</option>
        </select>
      </label>

      <label className={styles.fullWidth}>
        Notes
        <textarea rows={3} value={data.notes} onChange={update("notes")} />
      </label>

      <button type="submit" className={styles.primary}>
        Continue to Calibration →
      </button>
    </form>
  );
}
