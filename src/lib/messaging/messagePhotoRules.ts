export const messagePhotoLimit = 3;
export const messagePhotoBytes = 5 * 1024 * 1024;
export const messagePhotoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PhotoMessageInput = {kind:"direct"|"reply"|"listing"|"buy_request"|"vendor"|"store";targetId:string;body:string;requestId:string;draftId:string;photoIds:string[]};
export function validateMessagePhoto(file:{type:string;size:number;name:string}) {
  if(!["image/jpeg","image/png"].includes(file.type)||file.size<1||file.size>messagePhotoBytes||file.name.length>200)
    throw new Error("사진은 JPG/PNG, 각 5MB 이내로 선택해 주세요.");
}
export function validPhotoMessage(input:PhotoMessageInput) {
  return !!input&&["direct","reply","listing","buy_request","vendor","store"].includes(input.kind)&&
    [input.targetId,input.requestId,input.draftId].every(x=>typeof x==="string"&&messagePhotoUuid.test(x))&&
    Array.isArray(input.photoIds)&&input.photoIds.length>=1&&input.photoIds.length<=messagePhotoLimit&&
    new Set(input.photoIds).size===input.photoIds.length&&input.photoIds.every(x=>typeof x==="string"&&messagePhotoUuid.test(x));
}
