import { useEffect, useRef, useState } from 'react';
import { PlacemarkInfo } from '../types';
import { MapPin, Navigation, Info, AlertTriangle } from 'lucide-react';

interface SamsaraMapProps {
  placemarks: PlacemarkInfo[];
  startLabel: string;
  endLabel: string;
}

declare global {
  interface Window {
    L: any;
  }
}

export default function SamsaraMap({ placemarks, startLabel, endLabel }: SamsaraMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Filter placemarks that have valid coordinates
  const validPlacemarks = placemarks.filter(
    (pm) => pm.coordinates && !isNaN(pm.coordinates.lat) && !isNaN(pm.coordinates.lng)
  );

  // 1. Load Leaflet scripts from CDN dynamically
  useEffect(() => {
    if (window.L) {
      setIsLeafletLoaded(true);
      return;
    }

    // Load CSS
    const linkId = 'leaflet-css';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load JS
    const scriptId = 'leaflet-js';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        setIsLeafletLoaded(true);
      };
      script.onerror = () => {
        setLoadError(true);
      };
      document.body.appendChild(script);
    } else {
      // Script is already in DOM, check periodically
      const interval = setInterval(() => {
        if (window.L) {
          setIsLeafletLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  // 2. Initialize or Update Map
  useEffect(() => {
    if (!isLeafletLoaded || !mapContainerRef.current || !window.L) return;

    const L = window.L;

    // Create map instance if it doesn't exist
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([0, 0], 2);

      // Add nice CartoDB Light tile layer (fits beautifully with our warm neutral style)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstanceRef.current);

      // Layer group for our track features
      markersLayerRef.current = L.featureGroup().addTo(mapInstanceRef.current);
    }

    const markersLayer = markersLayerRef.current;
    const map = mapInstanceRef.current;

    // Clear previous elements
    markersLayer.clearLayers();

    if (validPlacemarks.length === 0) {
      map.setView([37.7749, -122.4194], 10); // Default San Francisco
      return;
    }

    const latLngs: [number, number][] = [];
    const trailLatLngs: [number, number][] = [];

    // Custom circle markers style
    validPlacemarks.forEach((pm, index) => {
      if (!pm.coordinates) return;
      const { lat, lng } = pm.coordinates;
      latLngs.push([lat, lng]);
      
      if (pm.isTargeted) {
        trailLatLngs.push([lat, lng]);
      }

      // Decide styling
      let color = '#4f46e5'; // sleek indigo for active track log pins
      let radius = 6;
      let fillOpacity = 0.6;
      let weight = 1;

      if (pm.isShiftStart) {
        color = '#16a34a'; // solid green for Start of Shift
        radius = 10;
        fillOpacity = 0.9;
        weight = 3;
      } else if (pm.isShiftEnd) {
        color = '#dc2626'; // solid red for End of Shift
        radius = 10;
        fillOpacity = 0.9;
        weight = 3;
      } else if (pm.isJobActivityStart) {
        color = '#3b82f6'; // vibrant blue for job activity start
        radius = 9;
        fillOpacity = 0.85;
        weight = 2.5;
      } else if (pm.isJobActivityEnd) {
        color = '#8b5cf6'; // vibrant purple/violet for job activity end
        radius = 9;
        fillOpacity = 0.85;
        weight = 2.5;
      } else if (!pm.isTargeted) {
        color = '#94a3b8'; // subtle slate gray for Untouched metadata points
        radius = 4;
        fillOpacity = 0.35;
        weight = 1;
      }

      // Create a marker (either custom image or circle marker)
      let marker: any;
      if (pm.customIcon) {
        const isShape = pm.customIcon.includes('shapes');
        const iconSize: [number, number] = isShape ? [28, 28] : [32, 32];
        const iconAnchor: [number, number] = isShape ? [14, 14] : [16, 32];
        const customLIcon = L.icon({
          iconUrl: pm.customIcon,
          iconSize: iconSize,
          iconAnchor: iconAnchor,
          popupAnchor: [0, -iconAnchor[1]]
        });
        marker = L.marker([lat, lng], { icon: customLIcon });
      } else {
        marker = L.circleMarker([lat, lng], {
          radius,
          fillColor: color,
          color: '#ffffff',
          weight,
          opacity: 1,
          fillOpacity,
        });
      }

      // HTML tooltip/popup popup content
      const popupHtml = `
        <div class="p-2 font-sans max-w-[240px]">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color: ${color}"></span>
            <strong class="text-xs text-neutral-800 font-semibold">
              ${pm.isShiftStart ? 'START OF SHIFT' : pm.isShiftEnd ? 'END OF SHIFT' : pm.isJobActivityStart ? `START OF JOB ACTIVITY (${pm.jobActivityProject})` : pm.isJobActivityEnd ? `END OF JOB ACTIVITY (${pm.jobActivityProject})` : pm.isTargeted ? 'SAMSARA BREADCRUMB' : 'METADATA PIN'}
            </strong>
          </div>
          ${pm.isTimeGapStart && pm.timeGapWithNextMin ? `
            <div class="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded inline-block font-semibold mb-1 border border-amber-200">
              ⚠️ Time Gap Detected: ${pm.timeGapWithNextMin} mins
            </div>
          ` : ''}
          <h4 class="text-sm font-bold text-neutral-900 mb-0.5 break-words">
            ${pm.name}
          </h4>
          ${pm.originalName !== pm.name ? `
            <div class="text-[11px] text-neutral-500 mb-1">
              Orig: <span class="line-through">${pm.originalName}</span>
            </div>
          ` : ''}
          ${pm.folderName ? `
            <div class="text-[10px] text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded inline-block font-semibold mb-1">
              📁 ${pm.folderName}
            </div>
          ` : ''}
          ${pm.timestamp ? `
            <div class="text-xs text-neutral-600 flex items-center gap-1 mt-1">
              <span class="font-medium">Time:</span> ${new Date(pm.timestamp).toLocaleString()}
            </div>
          ` : ''}
          <div class="text-xs text-neutral-500 mt-1 font-mono break-all">
            ${lat.toFixed(5)}, ${lng.toFixed(5)}
          </div>
          ${pm.description ? `
            <div class="text-[11px] text-neutral-600 bg-neutral-50 p-1.5 rounded border border-neutral-100 mt-1.5 max-h-[60px] overflow-y-auto">
              ${pm.description}
            </div>
          ` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        className: 'samsara-map-popup',
      });

      marker.addTo(markersLayer);
    });

    // Draw the driving track line on targeted trail coordinates (or fallback to all if none targeted)
    const activeLineCoords = trailLatLngs.length > 0 ? trailLatLngs : latLngs;
    if (activeLineCoords.length > 1) {
      const polyline = L.polyline(activeLineCoords, {
        color: '#4f46e5', // Sleek Indigo
        weight: 3.5,
        opacity: 0.8,
        dashArray: '2, 6', // Elegant dotted driving line
      }).addTo(markersLayer);

      // Fit bounds with comfortable padding
      map.fitBounds(markersLayer.getBounds(), {
        padding: [30, 30],
        maxZoom: 16
      });
    } else if (activeLineCoords.length === 1) {
      map.setView(activeLineCoords[0], 14);
    }

    // Force a map resize calculation to avoid display bugs
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

  }, [isLeafletLoaded, validPlacemarks, startLabel, endLabel]);

  // Clean up map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[360px] bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex flex-col">
      {/* Loading Overlay */}
      {!isLeafletLoaded && !loadError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="relative flex items-center justify-center mb-3">
            <div className="w-10 h-10 border-3 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <Navigation className="absolute w-4 h-4 text-indigo-600 animate-pulse" />
          </div>
          <span className="text-sm font-medium text-slate-600">Loading interactive map...</span>
        </div>
      )}

      {/* Load Error */}
      {loadError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mb-2" />
          <h4 className="text-base font-semibold text-slate-800">Map Loading Error</h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            Unable to fetch mapping services from CDN. Check your connection or continue using the file processor and list inspector.
          </p>
        </div>
      )}

      {/* Map Element */}
      <div id="samsara-leaflet-map" ref={mapContainerRef} className="w-full flex-1 z-0" />

      {/* Map Legend bar */}
      {validPlacemarks.length > 0 && (
        <div className="bg-white border-t border-slate-100 px-4 py-2.5 text-xs flex flex-wrap gap-4 items-center justify-between text-slate-600 font-sans shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {validPlacemarks.some(p => p.isShiftStart) && (
              <span className="flex items-center gap-1.5">
                <img src="https://maps.google.com/mapfiles/kml/paddle/grn-stars.png" className="w-5 h-5 shrink-0 object-contain" alt="Start of Shift" referrerPolicy="no-referrer" />
                <span className="font-semibold text-slate-700">Start of Shift</span>
              </span>
            )}
            {validPlacemarks.some(p => p.isShiftEnd) && (
              <span className="flex items-center gap-1.5">
                <img src="https://maps.google.com/mapfiles/kml/paddle/red-stars.png" className="w-5 h-5 shrink-0 object-contain" alt="End of Shift" referrerPolicy="no-referrer" />
                <span className="font-semibold text-slate-700">End of Shift</span>
              </span>
            )}
            {validPlacemarks.some(p => p.isJobActivityStart || p.isJobActivityEnd) && (
              <span className="flex items-center gap-1.5">
                <img src="https://maps.google.com/mapfiles/kml/shapes/cabs.png" className="w-5 h-5 shrink-0 object-contain" alt="Time Gap" referrerPolicy="no-referrer" />
                <span className="font-semibold text-slate-700">Time Gap (Job Activity)</span>
              </span>
            )}
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-[#4f46e5] inline-block"></span>
              <span>
                {validPlacemarks.filter(p => p.isTargeted).length} Samsara track logs mapped
                {validPlacemarks.some(p => p.isJobActivityStart || p.isJobActivityEnd) && ` (with ${validPlacemarks.filter(p => p.isJobActivityStart).length} job sites)`}
              </span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400 italic flex items-center gap-1 font-medium ml-auto">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            Click markers to view details
          </div>
        </div>
      )}

      {validPlacemarks.length === 0 && isLeafletLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-4 text-center">
          <MapPin className="w-8 h-8 text-slate-300 mb-2" />
          <span className="text-xs font-medium">No valid coordinate records found to display on map</span>
          <span className="text-[10px] text-slate-400 mt-1 font-medium">We can still modify labels in KML or CSV files perfectly</span>
        </div>
      )}
    </div>
  );
}
