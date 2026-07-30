import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UploadCloud,
  FileSpreadsheet,
  MapPin,
  Download,
  RefreshCw,
  Trash2,
  History,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Settings2,
  FileCode,
  Map,
  X,
  FileText,
  Navigation,
  Plus
} from 'lucide-react';

import SamsaraMap from './components/SamsaraMap';
import SamsaraDataViewer from './components/SamsaraDataViewer';
import { processKMZ, processCSV } from './utils/fileProcessor';
import { PlacemarkInfo, CSVRow, LabelingMethod, FileMetadata } from './types';

// History type for localStorage
interface HistoryItem {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: 'kmz' | 'csv' | 'kml';
  processedAt: string;
  placemarksCount: number;
  startLabel: string;
  endLabel: string;
  labelingMethod: LabelingMethod;
}

const ACTIVITIES = [
  'INSTALL',
  'TEARDOWN',
  'SWAPS/CHECKS',
  'CONDUCT SIGHT DISTANCE',
  'SWAPS/CHECKS & TEARDOWN',
  'INSTALL & SWAPS',
  'INSTALL & TEARDOWN',
  'CONDUCT PARKING',
  'CONDUCT RADAR',
  'CONDUCT RADAR (SPOT SPEED)',
  'INSTALL & CONDUCT PARKING',
  'INSTALL & CONDUCT RADAR',
  'TEARDOWN & CONDUCT RADAR (SPOT SPEED)',
];

export default function App() {
  // Config state
  const [startLabel, setStartLabel] = useState('(START OF SHIFT)');
  const [endLabel, setEndLabel] = useState('(END OF SHIFT)');
  const [labelingMethod, setLabelingMethod] = useState<LabelingMethod>('append');
  
  // New States for project numbers & gaps
  const [projectNumbers, setProjectNumbers] = useState<string[]>(['']);
  const [projectActivities, setProjectActivities] = useState<string[]>(['']);
  const [projectRelatedEnabled, setProjectRelatedEnabled] = useState<boolean[]>([false]);
  const [relatedProjectNumbers, setRelatedProjectNumbers] = useState<string[]>(['']);
  const [timeGapThresholdMinutes, setTimeGapThresholdMinutes] = useState<number>(5);
  const [distanceThresholdMeters, setDistanceThresholdMeters] = useState<number>(200);
  const [isProcessed, setIsProcessed] = useState<boolean>(false);

  // File processing state
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'kmz' | 'csv' | 'kml' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Processed Output Data
  const [placemarks, setPlacemarks] = useState<PlacemarkInfo[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [selectedCsvColumn, setSelectedCsvColumn] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] = useState<string>('');
  
  // Drag & drop state
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('samsara_labeler_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

  // Cleanup download URL on unmount or file change
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  // Handle Drag Over
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  // Handle Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  // Reset file selection
  const handleReset = () => {
    setFile(null);
    setFileType(null);
    setPlacemarks([]);
    setCsvHeaders([]);
    setCsvRows([]);
    setSelectedCsvColumn('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessed(false);
    setProjectNumbers(['']);
    setProjectActivities(['']);
    setProjectRelatedEnabled([false]);
    setRelatedProjectNumbers(['']);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setOutputFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Validate file ext
  const validateAndSetFile = (uploadedFile: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessed(false);
    setPlacemarks([]);
    setCsvHeaders([]);
    setCsvRows([]);
    
    const name = uploadedFile.name.toLowerCase();
    let type: 'kmz' | 'csv' | 'kml' | null = null;

    if (name.endsWith('.kmz')) {
      type = 'kmz';
    } else if (name.endsWith('.csv')) {
      type = 'csv';
    } else if (name.endsWith('.kml')) {
      type = 'kml';
    } else {
      setErrorMessage('Unsupported file format. Please upload a .KMZ, .KML or .CSV file.');
      return;
    }

    setFile(uploadedFile);
    setFileType(type);
  };

  // Core processing trigger
  const processUploadedFile = async (
    targetFile: File,
    type: 'kmz' | 'kml' | 'csv',
    start: string,
    end: string,
    method: LabelingMethod,
    targetCol: string,
    projs: string[],
    gapMin: number,
    distM: number,
    acts: string[] = [],
    relatedEnabled: boolean[] = [],
    relatedProjs: string[] = []
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    
    try {
      if (type === 'kmz' || type === 'kml') {
        const { updatedBlob, placemarks: parsedPlacemarks, kmlFileName } = await processKMZ(
          targetFile,
          start,
          end,
          method,
          projs,
          gapMin,
          distM,
          acts,
          relatedEnabled,
          relatedProjs
        );

        setPlacemarks(parsedPlacemarks);
        
        // Revoke old URL if existing
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        
        const url = URL.createObjectURL(updatedBlob);
        setDownloadUrl(url);

        // Name output file nicely
        const ext = type === 'kmz' ? '.kmz' : '.kml';
        const baseName = targetFile.name.substring(0, targetFile.name.lastIndexOf('.'));
        const outName = `${baseName}_labeled${ext}`;
        setOutputFileName(outName);

        const activeProjs = projs.filter(p => p.trim().length > 0);
        if (activeProjs.length > 0) {
          setSuccessMessage(`Scanned log file "${kmlFileName}" inside KMZ. Labeled Start/End shift, and mapped job activity for Project(s) ${activeProjs.join(', ')} near gaps!`);
        } else {
          setSuccessMessage(`Scanned log file "${kmlFileName}" inside KMZ. Labeled Start of Shift and End of Shift successfully!`);
        }
        setIsProcessed(true);
        
        // Save to History
        saveToHistory(targetFile.name, targetFile.size, type, parsedPlacemarks.length, start, end, method);
      } else {
        // CSV processing
        const { updatedBlob, headers, rows, selectedColumn } = await processCSV(
          targetFile,
          start,
          end,
          method,
          targetCol
        );

        setCsvHeaders(headers);
        setCsvRows(rows);
        setSelectedCsvColumn(selectedColumn);

        // Revoke old URL if existing
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        
        const url = URL.createObjectURL(updatedBlob);
        setDownloadUrl(url);

        const baseName = targetFile.name.substring(0, targetFile.name.lastIndexOf('.'));
        setOutputFileName(`${baseName}_labeled.csv`);

        setSuccessMessage(`Scanned Samsara CSV logs. Labeled column "${selectedColumn}" for the start and end rows!`);
        setIsProcessed(true);
        
        saveToHistory(targetFile.name, targetFile.size, 'csv', rows.length, start, end, method);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An error occurred while processing the file. Please verify its format.');
    } finally {
      setIsLoading(false);
    }
  };

  // Apply updated labeling configuration to already loaded file
  const handleApplyConfig = () => {
    if (!file || !fileType) return;

    if (fileType === 'kmz' || fileType === 'kml') {
      const hasEmptyProject = projectNumbers.some(p => p.trim() === '');
      const hasEmptyActivity = projectActivities.some(a => a.trim() === '');
      
      let hasEmptyRelated = false;
      for (let i = 0; i < projectNumbers.length; i++) {
        if (projectRelatedEnabled[i] && !(relatedProjectNumbers[i] || '').trim()) {
          hasEmptyRelated = true;
          break;
        }
      }

      if (hasEmptyProject || hasEmptyActivity || hasEmptyRelated) {
        setErrorMessage('Warning: All Project Numbers (including Related Projects if enabled) and Activities must be filled out before processing.');
        return;
      }
    }

    processUploadedFile(
      file,
      fileType,
      startLabel,
      endLabel,
      labelingMethod,
      selectedCsvColumn,
      projectNumbers,
      timeGapThresholdMinutes,
      distanceThresholdMeters,
      projectActivities,
      projectRelatedEnabled,
      relatedProjectNumbers
    );
  };

  // Change target CSV Column
  const handleCsvColumnChange = (column: string) => {
    setSelectedCsvColumn(column);
    if (!file || !fileType) return;
    processUploadedFile(
      file,
      fileType,
      startLabel,
      endLabel,
      labelingMethod,
      column,
      projectNumbers,
      timeGapThresholdMinutes,
      distanceThresholdMeters,
      projectActivities,
      projectRelatedEnabled,
      relatedProjectNumbers
    );
  };

  // Save history helper
  const saveToHistory = (
    fileName: string,
    bytesSize: number,
    type: 'kmz' | 'kml' | 'csv',
    count: number,
    start: string,
    end: string,
    method: LabelingMethod
  ) => {
    // Format human readable size
    let sizeStr = '';
    if (bytesSize < 1024) sizeStr = `${bytesSize} B`;
    else if (bytesSize < 1024 * 1024) sizeStr = `${(bytesSize / 1024).toFixed(1)} KB`;
    else sizeStr = `${(bytesSize / (1024 * 1024)).toFixed(1)} MB`;

    const newItem: HistoryItem = {
      id: `hist-${Date.now()}`,
      fileName,
      fileSize: sizeStr,
      fileType: type,
      processedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString(),
      placemarksCount: count,
      startLabel: start,
      endLabel: end,
      labelingMethod: method,
    };

    setHistory(prev => {
      // Limit history to 10 items
      const updated = [newItem, ...prev.filter(item => item.fileName !== fileName)].slice(0, 10);
      localStorage.setItem('samsara_labeler_history', JSON.stringify(updated));
      return updated;
    });
  };

  // Clear all history
  const handleClearHistory = () => {
    localStorage.removeItem('samsara_labeler_history');
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Header / Nav */}
      <header className="h-16 px-6 lg:px-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-500/10">
            <Navigation className="w-4.5 h-4.5 text-white rotate-45" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-slate-800 flex items-center gap-2">
              Samsara Log Processor
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-400 font-semibold tracking-widest uppercase">
              GPS Boundary Automator
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Active</span>
          </div>
          <div className="hidden md:block h-8 w-[1px] bg-slate-200"></div>
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-semibold leading-none">Dispatch Ops</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Logistics Admin</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-indigo-600">
              DO
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Dynamic Alert Banner */}
        <AnimatePresence mode="wait">
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Error:</span> {errorMessage}
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Success!</span> {successMessage}
              </div>
              <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Section: Upload Area & Quick Config */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* File Upload Zone - Takes up 7 cols */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">File Management</h2>
                {file && (
                  <button
                    onClick={handleReset}
                    className="text-xs text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear file
                  </button>
                )}
              </div>

              {!file ? (
                /* Drag & Drop Area */
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 min-h-[220px] flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? 'border-indigo-500 bg-indigo-50/50'
                      : 'border-indigo-200 bg-indigo-50/10 hover:border-indigo-300 hover:bg-indigo-50/30'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".kmz,.kml,.csv"
                    className="hidden"
                  />
                  <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mb-4 border border-indigo-200">
                    <UploadCloud className="w-7 h-7 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">
                    Upload KMZ or CSV
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm px-4">
                    Drag & drop log files to trigger automated renaming of start/end shift boundary placemarks
                  </p>
                  <div className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md shadow-slate-200">
                    Browse Files
                  </div>
                </div>
              ) : (
                /* File Loaded Stats Card */
                <div className="flex-1 flex flex-col justify-between border border-slate-100 rounded-xl p-5 bg-slate-50/50">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl border ${
                      fileType === 'csv'
                        ? 'bg-indigo-100 border-indigo-200 text-indigo-700'
                        : 'bg-emerald-100 border-emerald-200 text-emerald-700'
                    }`}>
                      {fileType === 'csv' ? (
                        <FileSpreadsheet className="w-6 h-6" />
                      ) : (
                        <FileCode className="w-6 h-6" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900 break-all">{file.name}</h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>Size: {(file.size / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span className="uppercase font-semibold tracking-wider text-[10px]">
                          Format: {fileType}
                        </span>
                        {placemarks.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700 font-medium">
                              {placemarks.length} Placemarks found
                            </span>
                          </>
                        )}
                        {csvRows.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-700 font-medium">
                              {csvRows.length} Data rows loaded
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unprocessed notice */}
                  {!isLoading && !isProcessed && (
                    <div className="mt-4 p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-800 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <span className="font-bold block text-amber-900">File Queued & Ready</span>
                        <span>Please configure the Automation Logic on the right and click <strong>"Process All Queued Files"</strong> to execute log scanning.</span>
                      </div>
                    </div>
                  )}

                  {/* Processing feedback loader */}
                  {isLoading && (
                    <div className="my-4 p-4 bg-white border border-slate-100 rounded-lg flex items-center justify-center gap-3">
                      <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                      <span className="text-xs text-slate-500 font-medium">Processing logs and updating placemark labels...</span>
                    </div>
                  )}

                  {/* Success metrics */}
                  {!isLoading && isProcessed && downloadUrl && (
                    <div className="mt-5 pt-5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="text-xs text-slate-600">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          File successfully compiled
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Output file size: {((file.size + 150) / 1024).toFixed(1)} KB (estimated)
                        </p>
                      </div>
                      <a
                        href={downloadUrl}
                        download={outputFileName}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/15 cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                      >
                        <Download className="w-4 h-4" />
                        Download Labeled File
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Configuration - Takes up 5 cols */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col h-full justify-between gap-6">
              <div className="space-y-6">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Automation Logic</h2>

                <div className="space-y-4">
                  {/* Start of Shift label */}
                  <div className="space-y-1.5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        First Placemark
                      </label>
                      <span className="text-[10px] text-indigo-600 font-mono font-bold tracking-tight uppercase">Start boundary</span>
                    </div>
                    <input
                      type="text"
                      value={startLabel}
                      onChange={(e) => setStartLabel(e.target.value)}
                      placeholder="e.g. (START OF SHIFT)"
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-medium font-mono"
                    />
                  </div>

                  {/* End of Shift label */}
                  <div className="space-y-1.5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        Last Placemark
                      </label>
                      <span className="text-[10px] text-indigo-600 font-mono font-bold tracking-tight uppercase">End boundary</span>
                    </div>
                    <input
                      type="text"
                      value={endLabel}
                      onChange={(e) => setEndLabel(e.target.value)}
                      placeholder="e.g. (END OF SHIFT)"
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-medium font-mono"
                    />
                  </div>

                  {/* Method select */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">Labeling Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['append', 'prepend', 'replace'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setLabelingMethod(method)}
                          className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold capitalize cursor-pointer transition-all ${
                            labelingMethod === method
                              ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                              : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Project Numbers inputs */}
                  <div className="space-y-2.5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-800">
                        Project Configurations ({projectNumbers.length}/10)
                      </label>
                      <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Gap Mapping</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium leading-normal">
                      Assign an activity and map a project number to nearby Samsara time-gaps.
                    </p>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {projectNumbers.map((proj, idx) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 relative shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Configuration #{idx + 1}</span>
                            {projectNumbers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedProjs = projectNumbers.filter((_, i) => i !== idx);
                                  const updatedActs = projectActivities.filter((_, i) => i !== idx);
                                  const updatedRelatedEnabled = projectRelatedEnabled.filter((_, i) => i !== idx);
                                  const updatedRelatedProjs = relatedProjectNumbers.filter((_, i) => i !== idx);
                                  setProjectNumbers(updatedProjs);
                                  setProjectActivities(updatedActs);
                                  setProjectRelatedEnabled(updatedRelatedEnabled);
                                  setRelatedProjectNumbers(updatedRelatedProjs);
                                }}
                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                title="Remove Config"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500">Project Number</span>
                            <input
                              type="text"
                              value={proj}
                              onChange={(e) => {
                                const updated = [...projectNumbers];
                                updated[idx] = e.target.value;
                                setProjectNumbers(updated);
                              }}
                              placeholder="e.g. 26-240026"
                              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-semibold"
                            />
                          </div>

                          <div className="flex items-center justify-between py-1">
                            <span className="text-[10px] font-semibold text-slate-500">Related Projects</span>
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={projectRelatedEnabled[idx] || false}
                                onChange={(e) => {
                                  const updated = [...projectRelatedEnabled];
                                  updated[idx] = e.target.checked;
                                  setProjectRelatedEnabled(updated);
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                          </div>

                          {(projectRelatedEnabled[idx] || false) && (
                            <div className="space-y-1 animate-fadeIn duration-200">
                              <span className="text-[10px] font-semibold text-slate-500">Related Project Number</span>
                              <input
                                type="text"
                                value={relatedProjectNumbers[idx] || ''}
                                onChange={(e) => {
                                  const updated = [...relatedProjectNumbers];
                                  updated[idx] = e.target.value;
                                  setRelatedProjectNumbers(updated);
                                }}
                                placeholder="e.g. 26-240027"
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-semibold"
                              />
                            </div>
                          )}

                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-slate-500">Activity Dropdown</span>
                            <select
                              value={projectActivities[idx] || ''}
                              onChange={(e) => {
                                const updated = [...projectActivities];
                                updated[idx] = e.target.value;
                                setProjectActivities(updated);
                              }}
                              className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-medium"
                            >
                              <option value="">-- Choose Activity --</option>
                              {ACTIVITIES.map((act) => (
                                <option key={act} value={act}>
                                  {act}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>

                    {projectNumbers.length < 10 && (
                      <button
                        type="button"
                        onClick={() => {
                          setProjectNumbers([...projectNumbers, '']);
                          setProjectActivities([...projectActivities, '']);
                          setProjectRelatedEnabled([...projectRelatedEnabled, false]);
                          setRelatedProjectNumbers([...relatedProjectNumbers, '']);
                        }}
                        className="w-full py-1.5 px-3 border border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-600 hover:bg-indigo-50/50 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer mt-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Project Config
                      </button>
                    )}
                  </div>

                  {/* Advanced settings: thresholds */}
                  <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-800">
                        Scan Thresholds
                      </label>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Parameters</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Time Gap (Mins)</span>
                        <input
                          type="number"
                          min={2}
                          max={120}
                          value={timeGapThresholdMinutes}
                          onChange={(e) => setTimeGapThresholdMinutes(Math.max(2, parseInt(e.target.value) || 10))}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Max Dist (Meters)</span>
                        <input
                          type="number"
                          min={10}
                          max={1000}
                          value={distanceThresholdMeters}
                          onChange={(e) => setDistanceThresholdMeters(Math.max(10, parseInt(e.target.value) || 200))}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Action Button */}
              <div className="pt-5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={!file || isLoading}
                  onClick={handleApplyConfig}
                  className="w-full py-3.5 px-4 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-950 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-slate-200"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Process All Queued Files
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
                  Scan Samsara logs & non-targeted reference folders to identify and append shifts/job activities
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Visual Analytics / Map Section - Appears only when a file is processed */}
        {file && isProcessed && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-700">
                <Map className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Geographic Visualization</h2>
            </div>

            {/* Display Map */}
            <SamsaraMap
              placemarks={placemarks}
              startLabel={startLabel}
              endLabel={endLabel}
            />

            {/* Display Log Table Inspector */}
            <SamsaraDataViewer
              fileType={fileType || 'kmz'}
              placemarks={placemarks}
              csvHeaders={csvHeaders}
              csvRows={csvRows}
              selectedColumn={selectedCsvColumn}
              onSelectedColumnChange={handleCsvColumnChange}
              startLabel={startLabel}
              endLabel={endLabel}
              labelingMethod={labelingMethod}
            />
          </div>
        )}

        {/* Informative Guidance & How it works */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Quick Guide */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
              <HelpCircle className="w-4.5 h-4.5 text-indigo-500" />
              Processing Logic
            </h3>
            <ul className="space-y-4 text-xs text-slate-600 font-sans">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 border border-emerald-100">
                  1
                </span>
                <div>
                  <strong className="text-slate-800 font-semibold block">KMZ / KML File Scan</strong>
                  The system loads the file and uses native XML DOM parsers to inspect every <code className="bg-slate-50 px-1 border rounded text-[10px]">&lt;Placemark&gt;</code> element. It sorts them chronologically if GPS timestamps exist.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 border border-indigo-100">
                  2
                </span>
                <div>
                  <strong className="text-slate-800 font-semibold block">CSV Row Scan</strong>
                  For spreadsheets, we search for standard log text headers like <code className="bg-slate-50 px-1 border rounded text-[10px]">Name</code>, <code className="bg-slate-50 px-1 border rounded text-[10px]">Remark</code>, or <code className="bg-slate-50 px-1 border rounded text-[10px]">Event</code> to automatically apply modifications.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 border border-rose-100">
                  3
                </span>
                <div>
                  <strong className="text-slate-800 font-semibold block">Boundary Labelling</strong>
                  It targets the first placemark or row, applying the Shift Start modifier. Then, it targets the final placemark or row, applying the Shift End modifier, maintaining original data intact.
                </div>
              </li>
            </ul>
          </div>

          {/* Local Run History */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4.5 h-4.5 text-slate-500" />
                  Processing Activity
                </h3>
                {history.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-[10px] text-slate-400 hover:text-red-500 transition-colors flex items-center gap-0.5 cursor-pointer font-bold uppercase tracking-wider"
                  >
                    Clear History
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center">
                  <History className="w-8 h-8 text-slate-200 mb-2" />
                  <span>No logs processed in this browser session yet</span>
                  <span className="text-[10px] text-slate-300 mt-1">Uploaded files are processed entirely client-side</span>
                </div>
              ) : (
                <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-slate-100 bg-slate-50/40 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-700 truncate" title={item.fileName}>
                          {item.fileName}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>{item.fileSize}</span>
                          <span>•</span>
                          <span className="uppercase font-bold text-slate-500">{item.fileType}</span>
                          <span>•</span>
                          <span>{item.processedAt}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-700 rounded-full font-bold uppercase">
                          {item.placemarksCount} points
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-3 mt-4 text-center font-medium">
              🔒 Processing runs 100% locally. File contents are never transmitted to external servers.
            </div>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="h-12 bg-white border-t border-slate-200 px-6 lg:px-8 flex items-center justify-between text-[10px] font-medium text-slate-400 shrink-0 font-sans mt-12">
        <div>Connected to Samsara Cloud API v1.0.4</div>
        <div className="flex gap-4">
          <span>Version 2.4.0-Stable</span>
          <span className="text-slate-200">|</span>
          <span className="text-indigo-500 cursor-pointer hover:underline">View Documentation</span>
        </div>
      </footer>
    </div>
  );
}
