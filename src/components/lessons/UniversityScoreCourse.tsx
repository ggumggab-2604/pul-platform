"use client";

import { useState } from "react";
import { listPublicCourses, type PublicCourse } from "@/lib/courses/courseDirectory";
import { createClient } from "@/lib/supabase/client";
import { universityButton, universityInput } from "./universityStyles";

export function UniversityScoreCourse({ courseKey, courseName }: { courseKey: string | null; courseName: string | null }) {
  const [selected, setSelected] = useState({ key: courseKey, name: courseName });
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PublicCourse[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function search() {
    setBusy(true);
    setMessage("");
    setItems([]);
    try {
      const { items } = await listPublicCourses(createClient(), { keyword: query.trim() }, 12, 0);
      setItems(items);
      if (!items.length) setMessage("일치하는 구장이 없습니다.");
    } catch {
      setMessage("구장 검색에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-2">
    <input type="hidden" name="course" value={selected.key ?? ""} />
    <label className="grid gap-1 font-bold">실제 개최 구장 검색 (선택)
      <input className={universityInput} value={query} onChange={e => setQuery(e.target.value)} maxLength={100}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (query.trim() && !busy) void search(); } }} />
    </label>
    <button className={universityButton} type="button" onClick={search} disabled={busy || !query.trim()}>구장 검색</button>
    {message && <p role="status">{message}</p>}
    {items.length > 0 && <ul className="space-y-1">{items.map(course => <li key={course.courseKey}>
      <button type="button" className={universityButton} onClick={() => {
        setSelected({ key: course.courseKey, name: course.name });
        setItems([]);
      }}>{course.name} · {course.region} {course.city} · {course.courseType === "field" ? "필드" : "스크린"}</button>
    </li>)}</ul>}
    <p role="status">{selected.name ? "선택한 구장 · " + selected.name : "구장 미연결"}</p>
    {selected.key && <button type="button" className={universityButton} onClick={() => setSelected({ key: null, name: null })}>구장 연결 해제</button>}
  </div>;
}

