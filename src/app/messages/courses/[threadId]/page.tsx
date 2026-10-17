import {NextCoursePage} from "@/components/courses/CourseNextPages";
export default async function Page({params}:{params:Promise<{threadId:string}>}){return <NextCoursePage threadId={(await params).threadId}/>;}
