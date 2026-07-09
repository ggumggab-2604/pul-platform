"use client";

import { CourseList } from "@/components/courses/CourseList";
import {
  CourseSearchFilter,
  type CourseFilters,
} from "@/components/courses/CourseSearchFilter";
import { FeaturedCourseCards } from "@/components/courses/FeaturedCourseCards";
import { featuredCourses, golfCourses } from "@/data/courseData";
import type { GolfCourse } from "@/types";
import { useMemo, useState } from "react";

const defaultFilters: CourseFilters = {
  region: "전체",
  district: "전체",
  holes: "전체",
  reservable: "all",
  keyword: "",
};

function filterCourses(courses: GolfCourse[], filters: CourseFilters) {
  const keyword = filters.keyword.trim().toLowerCase();
  const holeNumber =
    filters.holes === "전체" ? null : Number.parseInt(filters.holes, 10);

  return courses.filter((course) => {
    if (filters.region !== "전체" && course.region !== filters.region) {
      return false;
    }
    if (filters.district !== "전체" && course.district !== filters.district) {
      return false;
    }
    if (holeNumber && course.holes !== holeNumber) {
      return false;
    }
    if (filters.reservable === "yes" && !course.reservable) {
      return false;
    }
    if (filters.reservable === "no" && course.reservable) {
      return false;
    }
    if (keyword) {
      const haystack = `${course.name} ${course.address} ${course.region} ${course.district}`.toLowerCase();
      if (!haystack.includes(keyword)) {
        return false;
      }
    }
    return true;
  });
}

export function CoursesPageContent() {
  const [filters, setFilters] = useState<CourseFilters>(defaultFilters);

  const filteredCourses = useMemo(
    () => filterCourses(golfCourses, filters),
    [filters],
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <CourseSearchFilter
        filters={filters}
        onChange={setFilters}
        resultCount={filteredCourses.length}
      />
      <FeaturedCourseCards courses={featuredCourses} />
      <CourseList courses={filteredCourses} />
    </div>
  );
}
