import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Demographics } from "../types";
import styles from "./DemographicsForm.module.css";

interface Props {
  onSubmit: (data: Demographics) => void;
}

const initial: Demographics = {
  participant_id: "",
  // session_id is filled in by App when the form is submitted (auto-numbered,
  // bumped each time the same participant runs another session).
  session_id: "",
  age: "",
  gender: "",
  dominant_hand: "",
  vision_condition: "",
  glasses_or_contacts: "",
  prior_eye_tracking_experience: "",
  prior_xr_experience: "",
  typing_experience: "",
  notes: "",
};

export function DemographicsForm({ onSubmit }: Props) {
  const [data, setData] = useState<Demographics>(initial);

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
      <h2>Demographic Session</h2>
      <p className={styles.hint}>
        Fill out participant information. participant_id is required. Session
        numbering is assigned automatically (S01 on the first run, then S02, S03
        for repeat sessions with the same participant).
      </p>

      <label>
        Participant ID *
        <input value={data.participant_id} onChange={update("participant_id")} placeholder="e.g. P001" required />
      </label>

      <label>
        Age
        <input value={data.age} onChange={update("age")} placeholder="e.g. 24" />
      </label>

      <label>
        Gender
        <input value={data.gender} onChange={update("gender")} placeholder="e.g. female / male / nonbinary" />
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
        Vision condition
        <input value={data.vision_condition} onChange={update("vision_condition")} placeholder="normal / myopia / hyperopia / etc." />
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
