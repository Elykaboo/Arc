const PHOTO_FRAME_ASPECT_RATIO = 4 / 5;

export type CropSettings = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type PhotoDraft = {
  id: string;
  fileName: string;
  originalDataUrl: string;
  width: number;
  height: number;
  crop: CropSettings;
  previewDataUrl: string;
};

const dataUrlToBytes = (dataUrl: string): number => {
  const payload = dataUrl.split(",")[1] || "";
  return Math.ceil((payload.length * 3) / 4);
};

const dataUrlStringBytes = (dataUrl: string): number => dataUrl.length;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const readFileAsDataUrl = async (file: File): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read image."));
      }
    };
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
};

const loadImageFromDataUrl = async (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to load image."));
    img.src = dataUrl;
  });
};

const getBaseCropDimensions = (
  width: number,
  height: number,
  targetAspectRatio = PHOTO_FRAME_ASPECT_RATIO,
): { width: number; height: number } => {
  const sourceAspectRatio = width / height;

  if (sourceAspectRatio > targetAspectRatio) {
    return {
      width: height * targetAspectRatio,
      height,
    };
  }

  return {
    width,
    height: width / targetAspectRatio,
  };
};

export const renderCroppedImageDataUrl = async (
  draft: Pick<PhotoDraft, "originalDataUrl" | "width" | "height" | "crop">,
  maxBytes: number,
): Promise<string> => {
  const image = await loadImageFromDataUrl(draft.originalDataUrl);
  const baseCrop = getBaseCropDimensions(draft.width, draft.height);
  const cropWidth = Math.max(1, baseCrop.width / draft.crop.zoom);
  const cropHeight = Math.max(1, baseCrop.height / draft.crop.zoom);
  const maxOffsetX = Math.max(0, (draft.width - cropWidth) / 2);
  const maxOffsetY = Math.max(0, (draft.height - cropHeight) / 2);
  const sourceX = clamp((draft.width - cropWidth) / 2 + draft.crop.offsetX * maxOffsetX, 0, draft.width - cropWidth);
  const sourceY = clamp((draft.height - cropHeight) / 2 + draft.crop.offsetY * maxOffsetY, 0, draft.height - cropHeight);

  let targetWidth = Math.min(960, Math.round(cropWidth));
  let targetHeight = Math.round(targetWidth / PHOTO_FRAME_ASPECT_RATIO);
  if (targetHeight > 1200) {
    targetHeight = 1200;
    targetWidth = Math.round(targetHeight * PHOTO_FRAME_ASPECT_RATIO);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to process image.");
  }

  let quality = 0.86;
  let result = "";

  while (true) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
    result = canvas.toDataURL("image/jpeg", quality);

    if (dataUrlStringBytes(result) <= maxBytes && dataUrlToBytes(result) <= maxBytes) {
      return result;
    }

    if (quality > 0.34) {
      quality -= 0.08;
      continue;
    }

    if (targetWidth <= 480) {
      break;
    }

    targetWidth = Math.max(480, Math.round(targetWidth * 0.86));
    targetHeight = Math.round(targetWidth / PHOTO_FRAME_ASPECT_RATIO);
    quality = 0.82;
  }

  throw new Error("Image is still too large after compression. Try a smaller photo.");
};

export const createPhotoDraft = async (file: File, maxPreviewBytes: number): Promise<PhotoDraft> => {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(originalDataUrl);
  const crop: CropSettings = { zoom: 1, offsetX: 0, offsetY: 0 };
  const previewDataUrl = await renderCroppedImageDataUrl(
    {
      originalDataUrl,
      width: image.width,
      height: image.height,
      crop,
    },
    maxPreviewBytes,
  );

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: file.name,
    originalDataUrl,
    width: image.width,
    height: image.height,
    crop,
    previewDataUrl,
  };
};
