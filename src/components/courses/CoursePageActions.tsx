"use client";
import Link from "next/link";
import {CourseApplicationAdminEntry} from "./CourseApplicationWorkspace";
export function CoursePageActions(){return <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><Link className="inline-flex min-h-11 items-center font-bold text-pul-deep underline" href="/courses/apply">구장 관계자 등록·관리</Link><CourseApplicationAdminEntry/></div>}
