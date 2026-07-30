export interface PlacemarkInfo {
  id: string;
  name: string;
  timestamp?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  description?: string;
  originalName: string;
  updatedName: string;
  folderName?: string;
  isProcessed?: boolean;
  isTargeted?: boolean;
  isShiftStart?: boolean;
  isShiftEnd?: boolean;
  isJobActivityStart?: boolean;
  isJobActivityEnd?: boolean;
  jobActivityProject?: string;
  jobActivityName?: string;
  isTimeGapStart?: boolean;
  isTimeGapEnd?: boolean;
  timeGapWithNextMin?: number;
  customIcon?: string;
}

export interface CSVRow {
  [key: string]: string;
}

export interface FileMetadata {
  fileName: string;
  fileSize: number;
  fileType: 'kmz' | 'csv' | 'kml';
  processedAt: string;
  placemarksCount: number;
  startLabel: string;
  endLabel: string;
}

export interface ProcessedFile {
  id: string;
  metadata: FileMetadata;
  placemarks: PlacemarkInfo[];
  // base64 or blob URL of the processed file for direct download
  downloadUrl: string;
}

export type LabelingMethod = 'append' | 'prepend' | 'replace';
