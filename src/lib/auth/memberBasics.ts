export type MonthlyGender = 'male' | 'female';
export const monthlyGenderLabels = { male: '남', female: '여' } as const;

export type MemberBasics = {
 gender: MonthlyGender | null;
 phone: string | null;
 birthYear: number | null;
 birthMonth: number | null;
 birthDay: number | null;
};

export type ApplicationPhone = { id: string; club: string; submittedAt: string; phone: string };
