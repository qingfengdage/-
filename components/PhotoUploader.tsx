
import React, { useCallback, useState } from 'react';
import { PhotoMetadata } from '../types';
import { parseMrkContent } from '../utils';

interface PhotoUploaderProps {
  onPhotosProcessed: (photos: PhotoMetadata[]) => void;
  isProcessing: boolean;
}

// Declare EXIF global from the script tag
declare global {
  interface Window {
    EXIF: any;
  }
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({ onPhotosProcessed, isProcessing }) => {
  const [loadingText, setLoadingText] = useState('');

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoadingText(`正在分析文件...`);
    
    // Separate Image files and MRK file
    const imageFiles: File[] = [];
    let mrkFile: File | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.mrk')) {
        mrkFile = file;
      } else if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg')) {
        imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) {
      setLoadingText('');
      return;
    }

    // 1. Parse MRK if exists
    let rtkMap = new Map<number, 'FIXED' | 'FLOAT' | 'SINGLE'>();
    if (mrkFile) {
      setLoadingText('正在解析 POS 数据 (.MRK)...');
      try {
        const text = await mrkFile.text();
        rtkMap = parseMrkContent(text);
      } catch (e) {
        console.error("Failed to parse MRK", e);
      }
    }

    setLoadingText(`正在解析 ${imageFiles.length} 张照片...`);
    const processedPhotos: PhotoMetadata[] = [];

    const processFile = (file: File): Promise<void> => {
      return new Promise((resolve) => {
        window.EXIF.getData(file, function (this: any) {
          const lat = window.EXIF.getTag(this, "GPSLatitude");
          const lng = window.EXIF.getTag(this, "GPSLongitude");
          const latRef = window.EXIF.getTag(this, "GPSLatitudeRef") || "N";
          const lngRef = window.EXIF.getTag(this, "GPSLongitudeRef") || "E";
          const alt = window.EXIF.getTag(this, "GPSAltitude") || 0;
          const accuracy = window.EXIF.getTag(this, "GPSHPositioningError");
          const dateTime = window.EXIF.getTag(this, "DateTimeOriginal");

          // Convert DMS to Decimal
          const toDecimal = (number: number[], ref: string) => {
            if (!number || number.length < 3) return 0;
            let decimal = number[0] + number[1] / 60 + number[2] / 3600;
            return (ref === "S" || ref === "W") ? -decimal : decimal;
          };

          if (lat && lng) {
            // Parse Date: "2023:10:27 10:00:00" -> Timestamp
            let timestamp = 0;
            if (dateTime) {
              const parts = dateTime.split(" ");
              const dateParts = parts[0].split(":");
              const timeParts = parts[1].split(":");
              const dateObj = new Date(
                parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]),
                parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2])
              );
              timestamp = dateObj.getTime();
            } else {
               timestamp = file.lastModified;
            }

            processedPhotos.push({
              id: file.name + timestamp,
              name: file.name,
              lat: toDecimal(lat, latRef),
              lng: toDecimal(lng, lngRef),
              alt: Number(alt),
              timestamp: timestamp,
              gpsAccuracy: accuracy ? Number(accuracy) : undefined,
              file: file // Keep file reference for later quality check
            });
          }
          resolve();
        });
      });
    };

    // Process in chunks
    for (let i = 0; i < imageFiles.length; i++) {
      await processFile(imageFiles[i]);
      if (i % 20 === 0) {
        setLoadingText(`已解析 ${i + 1} / ${imageFiles.length}...`);
      }
    }

    // Sort photos to match MRK sequence (Assuming alphabetic or timestamp order matches 1..N)
    // Most DJI drones name sequentially: DJI_0001.JPG, DJI_0002.JPG
    processedPhotos.sort((a, b) => a.name.localeCompare(b.name));

    // Map RTK status
    processedPhotos.forEach((photo, index) => {
      // MRK index is 1-based
      const rtkStatus = rtkMap.get(index + 1);
      if (rtkStatus) {
        photo.rtkStatus = rtkStatus;
      }
    });

    setLoadingText('');
    onPhotosProcessed(processedPhotos);
  }, [onPhotosProcessed]);

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <div className="flex flex-col items-center justify-center w-full">
        <label
          htmlFor="dropzone-file"
          className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors
            ${isProcessing ? 'bg-gray-100 border-gray-300' : 'bg-white border-blue-300 hover:bg-blue-50 hover:border-blue-500'}
          `}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            {isProcessing || loadingText ? (
              <div className="text-center">
                <svg className="w-8 h-8 mb-4 text-blue-500 animate-spin mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-gray-500">{loadingText || "正在处理数据..."}</p>
              </div>
            ) : (
              <>
                <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
                <p className="mb-2 text-sm text-gray-500 font-semibold text-center">点击上传照片 (.JPG) 和 POS 文件 (.MRK)</p>
                <p className="text-xs text-gray-500 text-center">可同时选中照片文件夹内的所有文件（支持拖拽）</p>
                <div className="mt-2 px-3 py-1 bg-slate-100 rounded text-[10px] text-slate-500 border border-slate-200">
                   支持 .MRK 自动解析 RTK 状态
                </div>
              </>
            )}
          </div>
          <input 
            id="dropzone-file" 
            type="file" 
            className="hidden" 
            multiple 
            accept="image/jpeg,image/jpg,.mrk" 
            onChange={handleFileChange}
            disabled={isProcessing || !!loadingText}
          />
        </label>
      </div>
    </div>
  );
};
