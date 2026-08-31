alter function public.list_lesson_university_departments_for_management(
  text, text, integer, integer
) volatile;

alter function public.get_lesson_university_department_for_management(text)
  volatile;

alter function public.list_lesson_university_department_requests_for_management(
  text, integer, integer
) volatile;
