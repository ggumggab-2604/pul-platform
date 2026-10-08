"use server";
import { validatePhotoTransfer } from "@/lib/images/photoPolicy";
import {revalidatePath} from "next/cache";
import {createExchangeMediaUploadIntent,finalizeExchangeMediaUpload,getExchangeMediaState,cleanupExchangeMediaUpload,removeExchangeMedia,ExchangeMediaStorageError} from "@/lib/market/marketExchangeStorage";
export async function createExchangeMediaUploadIntentAction(input:Parameters<typeof createExchangeMediaUploadIntent>[0]){try{validatePhotoTransfer({size:input.declaredByteSize});return await createExchangeMediaUploadIntent(input);}catch(error){if(error instanceof ExchangeMediaStorageError && error.code==="EXCHANGE_MEDIA_TERMINAL_CLEANED")return {retry:true as const};throw error;}}
export async function finalizeExchangeMediaUploadAction(id:string){const r=await finalizeExchangeMediaUpload(id);revalidatePath("/market");return r;}
export async function exchangeMediaStateAction(id:string){return getExchangeMediaState(id);}
export async function cleanupExchangeMediaAction(id:string){return cleanupExchangeMediaUpload(id);}
export async function removeExchangeMediaAction(id:string){const r=await removeExchangeMedia(id);revalidatePath("/market");return r;}
