"use client";
import {Container} from "@/components/ui/Container";
import {CoursePageActions} from "./CoursePageActions";
export function CoursePageHero(){return <Container className="px-4 py-5"><h1 className="text-2xl font-bold text-pul-deep sm:text-3xl">구장찾기</h1><p className="mt-2 text-pul-muted">지역과 구장명으로 야외·스크린 파크골프장을 찾아보세요.</p><CoursePageActions/></Container>}
