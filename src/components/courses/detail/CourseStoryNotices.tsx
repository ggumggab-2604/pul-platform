"use client";

import type { ReactNode } from "react";
import type { CourseStory } from "@/lib/courses/courseSteward";
import { CourseNoticeControls, useCourseNoticeRotation } from "./CourseNoticeStrip";
import styles from "./CourseFieldDetail.module.css";

export function CourseStoryNotices({ notices, renderNotice }: {
  notices: CourseStory[];
  renderNotice: (notice: CourseStory) => ReactNode;
}) {
  const rotation = useCourseNoticeRotation(notices);
  if (!notices.length) return null;
  return <div className={styles.storyNotices} aria-label="이야기방 공지" {...rotation.interactions}>
    <div className={styles.storyNoticeViewport} data-moving={rotation.previous !== null}>
      {notices.map((notice, index) => <ul key={notice.post_key} className={styles.storyNoticeSlide}
        data-state={rotation.slideState(index)} aria-hidden={index !== rotation.index}
        inert={index !== rotation.index} onAnimationEnd={event => {
          if (event.target === event.currentTarget && index === rotation.previous) rotation.finish();
        }}>{renderNotice(notice)}</ul>)}
    </div>
    <CourseNoticeControls rotation={rotation} labelPrefix="이야기방 " />
  </div>;
}
