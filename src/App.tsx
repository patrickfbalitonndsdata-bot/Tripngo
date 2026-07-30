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
  Plus,
  Route,
  BookOpen,
  Printer,
  ExternalLink
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
  const [relatedProjectNumbers, setRelatedProjectNumbers] = useState<string[][]>([['']]);
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
  const [activeView, setActiveView] = useState<'path' | 'trip'>('path');
  
  // Drag & drop state
  const [isDragActive, setIsDragActive] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
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
    setRelatedProjectNumbers([['']]);
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
        if (projectRelatedEnabled[i]) {
          const sublist = relatedProjectNumbers[i] || [];
          if (sublist.length === 0 || sublist.some(p => p.trim() === '')) {
            hasEmptyRelated = true;
            break;
          }
        }
      }

      if (hasEmptyProject || hasEmptyActivity || hasEmptyRelated) {
        setErrorMessage('Warning: All Project Numbers (including Related Projects if enabled) and Activities must be filled out before processing.');
        return;
      }
    }

    const serializedRelated = relatedProjectNumbers.map(sublist => 
      sublist.map(p => p.trim()).filter(Boolean).join(',')
    );

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
      serializedRelated
    );
  };

  // Change target CSV Column
  const handleCsvColumnChange = (column: string) => {
    setSelectedCsvColumn(column);
    if (!file || !fileType) return;

    const serializedRelated = relatedProjectNumbers.map(sublist => 
      sublist.map(p => p.trim()).filter(Boolean).join(',')
    );

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
      serializedRelated
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
        <div className="flex items-center gap-3 animate-fadeIn">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-500/10">
            <Route className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-slate-800 flex items-center gap-2">
              SchEZPath
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-400 font-semibold tracking-widest uppercase">
              Samsara Logs Trip Automator
            </p>
          </div>
        </div>

        {/* Integrated View Selection Tabs */}
        <div className="hidden md:flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
          <button
            onClick={() => setActiveView('path')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeView === 'path'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>SchEZPath Automator</span>
          </button>
          <button
            onClick={() => setActiveView('trip')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeView === 'trip'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>SchEZTrip Integrated</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsManualOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 border border-slate-200 hover:border-indigo-100 transition-all cursor-pointer"
            title="Open User Manual"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">User Manual</span>
          </button>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">Active</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Mobile View Selector Tabs */}
        <div className="md:hidden flex items-center justify-center bg-slate-100 p-1 rounded-xl border border-slate-200/60 w-full mb-2">
          <button
            onClick={() => setActiveView('path')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              activeView === 'path'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Automator</span>
          </button>
          <button
            onClick={() => setActiveView('trip')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              activeView === 'trip'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>SchEZTrip</span>
          </button>
        </div>

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

        {activeView === 'trip' ? (
          <div className="w-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col min-h-[750px] h-[calc(100vh-14rem)] animate-fadeIn">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-slate-800">SchEZTrip Portal Integration</h2>
                  <p className="text-[10px] text-slate-400 font-semibold">Active sandbox session of https://scheztrip.netlify.app/</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="https://scheztrip.netlify.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 hover:border-indigo-100 rounded-md transition-all cursor-pointer shadow-2xs"
                  title="Open SchEZTrip Web App in a new window"
                >
                  <span>Open in New Tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <iframe
              src="https://scheztrip.netlify.app/"
              title="SchEZTrip App"
              className="w-full flex-1 border-none bg-slate-50"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        ) : (
          <>

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
                            <div className="space-y-2.5 animate-fadeIn duration-200 bg-slate-50/70 p-3 rounded-xl border border-slate-200/50">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Related Project Numbers</span>
                                <span className="text-[10px] text-slate-400 font-semibold font-mono">({(relatedProjectNumbers[idx] || []).length}/10)</span>
                              </div>
                              
                              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-0.5">
                                {(relatedProjectNumbers[idx] || ['']).map((relProj, rIdx) => (
                                  <div key={rIdx} className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={relProj}
                                      onChange={(e) => {
                                        const updated = [...relatedProjectNumbers];
                                        const sublist = [...(updated[idx] || [''])];
                                        sublist[rIdx] = e.target.value;
                                        updated[idx] = sublist;
                                        setRelatedProjectNumbers(updated);
                                      }}
                                      placeholder={`e.g. 26-240027`}
                                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 font-semibold"
                                    />
                                    {(relatedProjectNumbers[idx] || ['']).length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = [...relatedProjectNumbers];
                                          const sublist = (updated[idx] || ['']).filter((_, i) => i !== rIdx);
                                          updated[idx] = sublist.length > 0 ? sublist : [''];
                                          setRelatedProjectNumbers(updated);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all cursor-pointer shrink-0"
                                        title="Remove related project number"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {(relatedProjectNumbers[idx] || ['']).length < 10 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...relatedProjectNumbers];
                                    const sublist = [...(updated[idx] || [''])];
                                    sublist.push('');
                                    updated[idx] = sublist;
                                    setRelatedProjectNumbers(updated);
                                  }}
                                  className="w-full py-1 px-2.5 border border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-600 hover:bg-indigo-50/50 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" /> Add Related Project Number
                                </button>
                              )}
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
                          setRelatedProjectNumbers([...relatedProjectNumbers, ['']]);
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
        </>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-medium text-slate-400 shrink-0 font-sans mt-12">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <div className="flex items-center gap-1.5 justify-center sm:justify-start">
            <span>© {new Date().getFullYear()} SchEZPath. All rights reserved.</span>
            <span className="text-slate-200">|</span>
            <span className="opacity-60 hover:opacity-100 transition-opacity">Developer: Patrick Franz O. B.</span>
          </div>
          <div className="text-slate-300 font-normal">Samsara Logs Trip Automator Suite</div>
        </div>
        <div className="flex items-center gap-4">
          <span>Connected to Samsara Cloud API v1.0.4</span>
          <span className="text-slate-200">|</span>
          <span>Version 2.5.0-Stable</span>
          <span className="text-slate-200">|</span>
          <button 
            onClick={() => setIsManualOpen(true)}
            className="text-indigo-500 cursor-pointer hover:underline hover:text-indigo-600 font-semibold focus:outline-none"
          >
            View Documentation & Manual
          </button>
        </div>
      </footer>

      {/* Interactive & Printable User Manual Modal */}
      <AnimatePresence>
        {isManualOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200"
            >
              {/* Modal Control Header */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0 no-print">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">SchEZPath Operations Guide</h2>
                    <p className="text-[10px] text-slate-400 font-medium">Visual handbook & printing engine</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      window.print();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xs cursor-pointer"
                    title="Export handbook as a clean PDF document"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Download PDF Manual</span>
                  </button>
                  <button
                    onClick={() => setIsManualOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Printable Area Wrapper */}
              <div className="printable-manual overflow-y-auto p-6 lg:p-10 space-y-8 flex-1 bg-white select-text">
                {/* Print Optimization Styles */}
                <style dangerouslySetInnerHTML={{ __html: `
                  @media print {
                    /* Hide everything except the printable manual */
                    body > * {
                      display: none !important;
                    }
                    body {
                      background: white !important;
                      color: black !important;
                      padding: 0 !important;
                      margin: 0 !important;
                    }
                    .printable-manual {
                      display: block !important;
                      position: absolute !important;
                      left: 0 !important;
                      top: 0 !important;
                      width: 100% !important;
                      max-height: none !important;
                      overflow: visible !important;
                      padding: 2.5cm !important;
                      font-size: 11pt !important;
                      background: white !important;
                    }
                    .no-print {
                      display: none !important;
                    }
                    /* Ensure nice page breaks */
                    .page-break {
                      page-break-before: always !important;
                    }
                    .print-border {
                      border: 1px solid #cbd5e1 !important;
                    }
                    .print-bg-slate {
                      background-color: #f8fafc !important;
                    }
                    .print-bg-indigo {
                      background-color: #e0e7ff !important;
                    }
                  }
                `}} />

                {/* Cover & Title Block */}
                <div className="border-b border-slate-100 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                        <Route className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-xl font-black text-indigo-900 tracking-tight">SchEZPath</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Operations &amp; Training Manual</h1>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Professional Guide for the Samsara Logs Trip Automator Suite
                    </p>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 font-mono space-y-0.5 md:border-l md:border-slate-200 md:pl-4">
                    <p className="font-bold text-slate-600 uppercase tracking-wider">System Reference</p>
                    <p>Doc ID: SEP-MAN-2026</p>
                    <p>Version: v2.5.0-Stable</p>
                    <p>Issued: July 2026</p>
                  </div>
                </div>

                {/* Brief Overview */}
                <div className="bg-indigo-50/50 print-bg-indigo border border-indigo-100 rounded-2xl p-5 space-y-2">
                  <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-widest">Introduction</h3>
                  <p className="text-xs text-indigo-950 leading-relaxed">
                    <strong>SchEZPath</strong> is a specialized automation engine built entirely for logistics managers and operators. 
                    It simplifies the complex process of parsing, analyzing, and labeling GPS shift boundaries and physical project locations recorded via Samsara sensors. 
                    By identifying time gaps and distance coordinates locally on your browser, SchEZPath maps complex project configurations and exports polished, ready-to-use trip logs instantly.
                  </p>
                </div>

                {/* System Capabilities / Features list */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                    Key Features &amp; System Capabilities
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-slate-200/60 rounded-xl space-y-1.5 print-border">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        <h4 className="text-xs font-bold text-slate-800">Dynamic Shift Boundary Labeling</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal pl-3.5">
                        Instantly locates the chronological start and end of trips, applying designated custom labels in either <strong>Append</strong> or <strong>Replace</strong> mode to demarcate driver shifts.
                      </p>
                    </div>

                    <div className="p-4 border border-slate-200/60 rounded-xl space-y-1.5 print-border">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        <h4 className="text-xs font-bold text-slate-800">Advanced Project Mapping Gaps</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal pl-3.5">
                        Scans geographical coordinates to locate Samsara "time-gaps" and automatically assigns them to corresponding project names and operational activities.
                      </p>
                    </div>

                    <div className="p-4 border border-slate-200/60 rounded-xl space-y-1.5 print-border">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        <h4 className="text-xs font-bold text-slate-800">Support for up to 10 Related Projects</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal pl-3.5">
                        Allows adding up to 10 fallback/related project numbers per active configuration. If a coordinate doesn't match the primary ID, the engine automatically checks secondary values.
                      </p>
                    </div>

                    <div className="p-4 border border-slate-200/60 rounded-xl space-y-1.5 print-border">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        <h4 className="text-xs font-bold text-slate-800">Geospatial Threshold Configs</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal pl-3.5">
                        Customize advanced matching parameters including <strong>Time-Gap Threshold</strong> (in minutes) and <strong>Distance Radius</strong> (in meters) for perfect location mapping.
                      </p>
                    </div>

                    <div className="p-4 border border-slate-200/60 rounded-xl space-y-1.5 print-border">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        <h4 className="text-xs font-bold text-slate-800">Interactive Map Preview</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal pl-3.5">
                        Features a built-in interactive map with color-coded pins (green for starts, red for ends, blue for matched gaps) and line-route tracks to inspect route metrics dynamically.
                      </p>
                    </div>

                    <div className="p-4 border border-slate-200/60 rounded-xl space-y-1.5 print-border">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        <h4 className="text-xs font-bold text-slate-800">Tabular Data &amp; Export Engine</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-normal pl-3.5">
                        Provides an active table viewer to search, filter, and inspect specific columns before generating the newly-labeled, standardized log file.
                      </p>
                    </div>
                  </div>
                </div>

                {/* GRAPHICAL DATA FLOW DIAGRAM (Using pure Tailwind components) */}
                <div className="page-break pt-4 space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                    Visual Data Processing Flowchart
                  </h3>
                  
                  {/* Visual flowchart container */}
                  <div className="bg-slate-50 print-bg-slate border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-around gap-4 text-center">
                    
                    {/* Node 1 */}
                    <div className="flex-1 max-w-[180px] p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1 relative print-border">
                      <div className="w-7 h-7 bg-amber-100 text-amber-700 font-bold rounded-full flex items-center justify-center text-xs mx-auto">1</div>
                      <p className="text-xs font-bold text-slate-700">Ingest Logs</p>
                      <p className="text-[10px] text-slate-400">Loads KMZ, KML or CSV files securely inside browser cache.</p>
                    </div>

                    <ArrowRight className="w-5 h-5 text-indigo-400 rotate-90 md:rotate-0" />

                    {/* Node 2 */}
                    <div className="flex-1 max-w-[180px] p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1 relative print-border">
                      <div className="w-7 h-7 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center text-xs mx-auto">2</div>
                      <p className="text-xs font-bold text-slate-700">Boundary Scanner</p>
                      <p className="text-[10px] text-slate-400">Identifies the earliest and latest timestamps to label shift transitions.</p>
                    </div>

                    <ArrowRight className="w-5 h-5 text-indigo-400 rotate-90 md:rotate-0" />

                    {/* Node 3 */}
                    <div className="flex-1 max-w-[180px] p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1 relative print-border">
                      <div className="w-7 h-7 bg-emerald-100 text-emerald-700 font-bold rounded-full flex items-center justify-center text-xs mx-auto">3</div>
                      <p className="text-xs font-bold text-slate-700">Multi-Project Match</p>
                      <p className="text-[10px] text-slate-400">Applies spatial rules and evaluates up to 10 related numbers.</p>
                    </div>

                    <ArrowRight className="w-5 h-5 text-indigo-400 rotate-90 md:rotate-0" />

                    {/* Node 4 */}
                    <div className="flex-1 max-w-[180px] p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1 relative print-border">
                      <div className="w-7 h-7 bg-indigo-600 text-white font-bold rounded-full flex items-center justify-center text-xs mx-auto">4</div>
                      <p className="text-xs font-bold text-slate-700">Polished Export</p>
                      <p className="text-[10px] text-slate-400">Updates files in real-time, displaying mapped paths and exporting files.</p>
                    </div>

                  </div>
                </div>

                {/* Step-by-Step Practical Instructions */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                    How to Process Trips in 4 Steps
                  </h3>
                  <div className="space-y-4 text-xs">
                    
                    {/* Step 1 */}
                    <div className="flex gap-4">
                      <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 shrink-0">01</span>
                      <div className="space-y-1">
                        <strong className="text-slate-800 block text-xs">Upload your Samsara Raw Data</strong>
                        <p className="text-slate-500 leading-relaxed text-[11px]">
                          Drag and drop or select either a raw <strong>.KMZ</strong> track file or a standard spreadsheet <strong>.CSV</strong> exported from your Samsara dashboard. 
                          The tool parses timestamps and extracts geographic coordinates.
                        </p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-4">
                      <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 shrink-0">02</span>
                      <div className="space-y-1">
                        <strong className="text-slate-800 block text-xs">Set Shift Boundary Configuration</strong>
                        <p className="text-slate-500 leading-relaxed text-[11px]">
                          Specify the precise terms you want applied at shift changes. 
                          Choose <strong>Append</strong> to keep original location names while attaching tags (e.g. <code>Location-Name (START OF SHIFT)</code>), or <strong>Replace</strong> to substitute them completely.
                        </p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-4">
                      <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 shrink-0">03</span>
                      <div className="space-y-1">
                        <strong className="text-slate-800 block text-xs">Map Projects &amp; Related Numbers</strong>
                        <p className="text-slate-500 leading-relaxed text-[11px]">
                          Enter your active Project Number and link it to an operational activity. 
                          If the data contains multiple connected/overlapping accounts, turn on <strong>Related Projects</strong> and list up to 10 secondary project numbers. 
                          The system checks secondary values sequentially.
                        </p>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex gap-4">
                      <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 shrink-0">04</span>
                      <div className="space-y-1">
                        <strong className="text-slate-800 block text-xs">Inspect Map and Trigger Download</strong>
                        <p className="text-slate-500 leading-relaxed text-[11px]">
                          A dynamic track map will plot your starting point, ending point, and mapped project nodes. 
                          Scroll through the processed data table to ensure everything checks out, then click <strong>Download Processed File</strong>.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Print watermark/footer credits */}
                <div className="border-t border-slate-100 pt-8 mt-12 text-center">
                  <p className="text-[9px] text-slate-400 font-mono tracking-wider uppercase">
                    SchEZPath Trip Automator Suite • Powered by Local Sandbox Parsing
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    Developed by: <strong>Patrick Franz O. B.</strong> • All Rights Reserved.
                  </p>
                </div>

              </div>

              {/* Modal Control Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0 no-print">
                <button
                  onClick={() => setIsManualOpen(false)}
                  className="px-4 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Close Handbook
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
