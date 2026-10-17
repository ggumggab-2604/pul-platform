import {NextCoursePage} from "@/components/courses/CourseNextPages";
export default async function Page({params}:{params:Promise<{id:string;threadId:string}>}){const {id,threadId}=await params;return <NextCoursePage courseKey={id} threadId={threadId} manage/>;}
