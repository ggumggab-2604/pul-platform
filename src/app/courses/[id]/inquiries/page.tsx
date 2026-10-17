import {NextCoursePage} from "@/components/courses/CourseNextPages";
export default async function Page({params}:{params:Promise<{id:string}>}){return <NextCoursePage courseKey={(await params).id} manage/>;}
