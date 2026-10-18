"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import type {ComponentProps} from "react";
import {safeMaterialReturn} from "@/lib/courses/courseMaterialNavigation";
import {safeCourseReturn} from "@/lib/courses/courseNavigation";
export function useCourseContentHref(){const query=useSearchParams(),value=query.get("returnTo"),materials=query.get("materialsReturn");return (href:string)=>{
 if(!href.startsWith("/courses/"))return href;
 const url=new URL(href,"https://pul.invalid");
 if(value)url.searchParams.set("returnTo",safeCourseReturn(value));
 const match=url.pathname.match(/^\/courses\/([^/]+)\/resources\/[^/]+/);
 if(materials&&match)url.searchParams.set("materialsReturn",safeMaterialReturn(materials,decodeURIComponent(match[1])));
 return url.pathname+url.search+url.hash;
};}
export function CourseContentLink({href,...props}:ComponentProps<typeof Link>){const withReturn=useCourseContentHref();return <Link {...props} href={typeof href==="string"?withReturn(href):href}/>;}
