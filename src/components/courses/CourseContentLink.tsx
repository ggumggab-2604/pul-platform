"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import type {ComponentProps} from "react";
import {safeCourseReturn} from "@/lib/courses/courseNavigation";
export function useCourseContentHref(){const query=useSearchParams(),value=query.get("returnTo");return (href:string)=>{if(!value||!href.startsWith("/courses/"))return href;const url=new URL(href,"https://pul.invalid");url.searchParams.set("returnTo",safeCourseReturn(value));return url.pathname+url.search+url.hash;};}
export function CourseContentLink({href,...props}:ComponentProps<typeof Link>){const withReturn=useCourseContentHref();return <Link {...props} href={typeof href==="string"?withReturn(href):href}/>;}
