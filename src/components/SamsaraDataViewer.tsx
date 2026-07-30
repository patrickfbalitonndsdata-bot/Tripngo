import { useState } from 'react';
import { PlacemarkInfo, CSVRow } from '../types';
import { Search, ChevronLeft, ChevronRight, FileSpreadsheet, MapPin, Tag } from 'lucide-react';

interface SamsaraDataViewerProps {
  fileType: 'kmz' | 'csv' | 'kml';
  placemarks?: PlacemarkInfo[];
  csvHeaders?: string[];
  csvRows?: CSVRow[];
  selectedColumn?: string;
  onSelectedColumnChange?: (col: string) => void;
  startLabel: string;
  endLabel: string;
  labelingMethod: 'append' | 'prepend' | 'replace';
}

export default function SamsaraDataViewer({
  fileType,
  placemarks = [],
  csvHeaders = [],
  csvRows = [],
  selectedColumn = '',
  onSelectedColumnChange,
  startLabel,
  endLabel,
  labelingMethod
}: SamsaraDataViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Handles KML/KMZ Rendering
  if (fileType === 'kmz' || fileType === 'kml') {
    const filteredPlacemarks = placemarks.filter(pm => 
      pm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (pm.originalName && pm.originalName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (pm.timestamp && pm.timestamp.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (pm.description && pm.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const totalPages = Math.ceil(filteredPlacemarks.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedPlacemarks = filteredPlacemarks.slice(startIndex, startIndex + itemsPerPage);

    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col font-sans">
        {/* Header section with search */}
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              KML Placemarks Inspector
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Showing total of {placemarks.length} log points scanned
            </p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search placemarks..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-4 py-1.5 w-full sm:w-64 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 bg-slate-50/50"
            />
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3 w-16">Index</th>
                <th className="px-4 py-3">Original Placemark Name</th>
                <th className="px-4 py-3">Label modification</th>
                <th className="px-4 py-3">Coordinates (Lat, Lng)</th>
                <th className="px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedPlacemarks.map((pm) => {
                // Find actual global index in sorted list
                const globalIndex = placemarks.findIndex(p => p.id === pm.id);
                
                let rowBgClass = "hover:bg-slate-50/60";
                let badge = null;
                let gapBadge = null;

                if (pm.isShiftStart) {
                  rowBgClass = "bg-emerald-50/40 hover:bg-emerald-50/60 font-medium";
                  badge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                      <img src="https://maps.google.com/mapfiles/kml/paddle/grn-stars.png" className="w-3.5 h-3.5 object-contain shrink-0" alt="Green star" referrerPolicy="no-referrer" />
                      START OF SHIFT
                    </span>
                  );
                } else if (pm.isShiftEnd) {
                  rowBgClass = "bg-rose-50/40 hover:bg-rose-50/60 font-medium";
                  badge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold border border-rose-200">
                      <img src="https://maps.google.com/mapfiles/kml/paddle/red-stars.png" className="w-3.5 h-3.5 object-contain shrink-0" alt="Red star" referrerPolicy="no-referrer" />
                      END OF SHIFT
                    </span>
                  );
                } else if (pm.isJobActivityStart) {
                  rowBgClass = "bg-indigo-50/40 hover:bg-indigo-50/60 font-medium";
                  badge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                      <img src="https://maps.google.com/mapfiles/kml/shapes/cabs.png" className="w-3.5 h-3.5 object-contain shrink-0" alt="Cab" referrerPolicy="no-referrer" />
                      START OF ACTIVITY ({pm.jobActivityProject})
                    </span>
                  );
                } else if (pm.isJobActivityEnd) {
                  rowBgClass = "bg-purple-50/40 hover:bg-purple-50/60 font-medium";
                  badge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-800 font-bold border border-purple-200">
                      <img src="https://maps.google.com/mapfiles/kml/shapes/cabs.png" className="w-3.5 h-3.5 object-contain shrink-0" alt="Cab" referrerPolicy="no-referrer" />
                      END OF ACTIVITY ({pm.jobActivityProject})
                    </span>
                  );
                } else if (pm.isTargeted) {
                  rowBgClass = "bg-indigo-50/10 hover:bg-indigo-50/20";
                } else {
                  rowBgClass = "opacity-75 hover:bg-slate-50/60";
                }

                if (pm.isTimeGapStart && pm.timeGapWithNextMin) {
                  gapBadge = (
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-50 text-amber-800 border border-amber-200 font-bold uppercase tracking-wider">
                      ⚠️ Time Gap: {pm.timeGapWithNextMin}m
                    </span>
                  );
                }

                return (
                  <tr key={pm.id} className={`${rowBgClass} transition-colors text-slate-700`}>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {globalIndex + 1}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <div className="flex flex-col">
                        <span className="font-semibold">{pm.originalName}</span>
                        {pm.folderName && (
                          <span className="text-[10px] text-indigo-500 font-semibold mt-0.5 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            Folder: {pm.folderName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {badge && <div className="mb-0.5">{badge}</div>}
                        {gapBadge && <div className="mb-0.5">{gapBadge}</div>}
                        {pm.isShiftStart || pm.isShiftEnd || pm.isJobActivityStart || pm.isJobActivityEnd ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 line-through text-[11px]">{pm.originalName}</span>
                            <span className="text-slate-300">→</span>
                            <span className="text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 text-[11px]">
                              {pm.updatedName}
                            </span>
                          </div>
                        ) : pm.isTargeted ? (
                          <span className="text-slate-400 italic text-[11px]">Unchanged (Inside Trail)</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-400 border border-slate-200 font-bold uppercase tracking-wider">
                            Untouched (Metadata)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {pm.coordinates ? (
                        <span>{pm.coordinates.lat.toFixed(5)}, {pm.coordinates.lng.toFixed(5)}</span>
                      ) : (
                        <span className="text-slate-300">No GPS data</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {pm.timestamp ? new Date(pm.timestamp).toLocaleString() : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}

              {filteredPlacemarks.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    No placemarks match your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredPlacemarks.length)} of {filteredPlacemarks.length} entries
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded border border-slate-200 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">Page {currentPage} of {totalPages}</span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded border border-slate-200 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Handles CSV Rendering
  if (fileType === 'csv') {
    // Columns to render (limit to first 5 for dashboard density + the selected modified column)
    const alwaysVisible = [selectedColumn].filter(Boolean);
    const otherHeaders = csvHeaders.filter(h => h !== selectedColumn);
    const displayHeaders = [...alwaysVisible, ...otherHeaders.slice(0, 4)];

    const filteredRows = csvRows.map((row, index) => ({ row, index })).filter(({ row }) => {
      return Object.values(row).some(val => 
        val.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

    const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedRows = filteredRows.slice(startIndex, startIndex + itemsPerPage);

    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col font-sans">
        {/* Header section with column selection and search */}
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              CSV Log Inspector
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs text-slate-500 font-medium">Target column to label:</span>
              <select
                value={selectedColumn}
                onChange={(e) => onSelectedColumnChange?.(e.target.value)}
                className="text-[11px] font-semibold bg-indigo-50/50 border border-indigo-200 text-indigo-700 rounded-lg px-2.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                {csvHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search CSV rows..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-4 py-1.5 w-full sm:w-64 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 bg-slate-50/50"
            />
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3 w-16">Row #</th>
                {displayHeaders.map(header => (
                  <th key={header} className="px-4 py-3">
                    <span className="flex items-center gap-1">
                      {header}
                      {header === selectedColumn && (
                        <Tag className="w-3.5 h-3.5 text-indigo-500" title="Target Column" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.map(({ row, index }) => {
                const isFirst = index === 0;
                const isLast = index === csvRows.length - 1 && csvRows.length > 1;

                let rowBgClass = "hover:bg-slate-50/60";
                let badge = null;

                if (isFirst) {
                  rowBgClass = "bg-emerald-50/30 hover:bg-emerald-50/50 font-medium";
                  badge = (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-800 font-bold ml-1.5 border border-emerald-200">
                      START OF SHIFT
                    </span>
                  );
                } else if (isLast) {
                  rowBgClass = "bg-rose-50/30 hover:bg-rose-50/50 font-medium";
                  badge = (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-100 text-rose-800 font-bold ml-1.5 border border-rose-200">
                      END OF SHIFT
                    </span>
                  );
                }

                return (
                  <tr key={index} className={`${rowBgClass} transition-colors text-slate-700`}>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {index + 1}
                    </td>
                    {displayHeaders.map((header) => {
                      const value = row[header] || '';
                      const isModifiedCol = header === selectedColumn;

                      if (isModifiedCol && (isFirst || isLast)) {
                        const originalValue = value; // Processed values are shown
                        const currentLabel = isFirst ? startLabel : endLabel;
                        
                        // Infer original value
                        let origVal = originalValue;
                        if (labelingMethod === 'append' && originalValue.endsWith(currentLabel)) {
                          origVal = originalValue.substring(0, originalValue.length - currentLabel.length).trim();
                        } else if (labelingMethod === 'prepend' && originalValue.startsWith(currentLabel)) {
                          origVal = originalValue.substring(currentLabel.length).trim();
                        } else if (labelingMethod === 'replace') {
                          origVal = '[Original Value]';
                        }

                        return (
                          <td key={header} className="px-4 py-3">
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className="text-indigo-600 font-semibold bg-indigo-50/70 border border-indigo-100 px-1.5 py-0.5 rounded text-[11px] inline-flex items-center gap-1">
                                {value}
                                {badge}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                Original: <span className="line-through">{origVal}</span>
                              </span>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={header} className="px-4 py-3 truncate max-w-[200px]" title={value}>
                          {value || <span className="text-slate-300 italic">empty</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={displayHeaders.length + 1} className="text-center py-8 text-slate-400">
                    No rows match your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredRows.length)} of {filteredRows.length} rows
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded border border-slate-200 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">Page {currentPage} of {totalPages}</span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded border border-slate-200 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
