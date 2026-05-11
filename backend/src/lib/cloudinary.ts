import { v2 as cloudinary } from "cloudinary";
import type { UploadApiOptions } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadImage(buffer: Buffer, folder = "cloud-chat"): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "image" }, (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      })
      .end(buffer);
  });
}

export async function uploadFile(
  buffer: Buffer,
  folder = "cloud-chat/messages",
  resourceType: "image" | "video" | "raw" | "auto" = "auto",
  originalName?: string
): Promise<{ url: string; resourceType: string; format: string }> {
  return new Promise((resolve, reject) => {
    const options: UploadApiOptions = {
      folder,
      resource_type: resourceType,
      ...(originalName ? { original_filename: originalName.replace(/\.[^.]+$/, ""), use_filename: true, unique_filename: true } : {}),
    };
    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) reject(error);
        else resolve({ url: result!.secure_url, resourceType: result!.resource_type, format: result!.format });
      })
      .end(buffer);
  });
}

export { cloudinary };
