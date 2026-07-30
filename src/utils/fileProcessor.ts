import JSZip from 'jszip';
import { PlacemarkInfo, CSVRow, LabelingMethod, FileMetadata } from '../types';

/**
 * Parses and processes KMZ/KML files or CSV files to add shift start/end labels.
 */

// Helper to extract coordinates from KML Placemark
function getPlacemarkCoordinates(placemark: Element): { lat: number; lng: number } | undefined {
  // Try to find Point -> coordinates
  const pointElement = placemark.getElementsByTagName('Point')[0];
  if (pointElement) {
    const coordElement = pointElement.getElementsByTagName('coordinates')[0];
    if (coordElement && coordElement.textContent) {
      const coordsStr = coordElement.textContent.trim();
      const parts = coordsStr.split(',');
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng };
        }
      }
    }
  }
  
  // Or check for other coordinate sources in case of LookAt or Camera
  const lookAtElement = placemark.getElementsByTagName('LookAt')[0] || placemark.getElementsByTagName('Camera')[0];
  if (lookAtElement) {
    const latEl = lookAtElement.getElementsByTagName('latitude')[0];
    const lngEl = lookAtElement.getElementsByTagName('longitude')[0];
    if (latEl && lngEl && latEl.textContent && lngEl.textContent) {
      const lat = parseFloat(latEl.textContent.trim());
      const lng = parseFloat(lngEl.textContent.trim());
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  }

  return undefined;
}

// Helper to parse lenient date/time stamp names into Date objects
function parseDateFromName(name: string): Date | undefined {
  if (!name) return undefined;
  let cleaned = name.trim();

  // Try standard parsing first
  let d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d;
  }

  // Normalize: space between minutes and AM/PM
  // e.g. "9:15AM" -> "9:15 AM"
  cleaned = cleaned.replace(/(\d{1,2}:\d{2})\s*([AP]M)/i, '$1 $2');

  // Replace timezone abbreviation (CDT, CST, EDT, EST, PDT, PST, MDT, MST) with standard offsets
  const tzMap: { [key: string]: string } = {
    CDT: '-0500',
    CST: '-0600',
    EDT: '-0400',
    EST: '-0500',
    PDT: '-0700',
    PST: '-0800',
    MDT: '-0600',
    MST: '-0700',
    CDST: '-0500',
    EDST: '-0400',
    PDST: '-0700',
    MDST: '-0600',
  };

  // Replace any matching uppercase word timezone at the end of the string
  const words = cleaned.split(/\s+/);
  if (words.length > 0) {
    const lastWord = words[words.length - 1].toUpperCase();
    if (tzMap[lastWord]) {
      words[words.length - 1] = tzMap[lastWord];
      cleaned = words.join(' ');
    }
  }

  // If there's no 4-digit year, inject the current year or fallback to 2026
  const hasYear = /\b(20\d{2})\b/.test(cleaned);
  if (!hasYear) {
    const monthRegex = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i;
    const monthDayMatch = cleaned.match(monthRegex);
    if (monthDayMatch) {
      const rest = cleaned.substring(monthDayMatch[0].length);
      const year = new Date().getFullYear() || 2026;
      cleaned = `${monthDayMatch[1]} ${monthDayMatch[2]} ${year}${rest}`;
    } else {
      // General fallback: append year before timezone abbreviations if possible, or just at the end
      const tzMatch = cleaned.match(/\b([A-Z]{3,4})\b$/i);
      const year = new Date().getFullYear() || 2026;
      if (tzMatch) {
        const tz = tzMatch[1];
        const beforeTz = cleaned.substring(0, cleaned.length - tz.length).trim();
        cleaned = `${beforeTz} ${year} ${tz}`;
      } else {
        cleaned = `${cleaned} ${year}`;
      }
    }
  }

  d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d;
  }

  return undefined;
}

// Helper to extract timestamp from KML Placemark
function getPlacemarkTimestamp(placemark: Element): string | undefined {
  const timeStamp = placemark.getElementsByTagName('TimeStamp')[0];
  if (timeStamp) {
    const when = timeStamp.getElementsByTagName('when')[0];
    if (when && when.textContent) {
      return when.textContent.trim();
    }
  }
  const timeSpan = placemark.getElementsByTagName('TimeSpan')[0];
  if (timeSpan) {
    const begin = timeSpan.getElementsByTagName('begin')[0];
    if (begin && begin.textContent) {
      return begin.textContent.trim();
    }
  }
  // Try custom data fields or description if no standard timestamps
  const desc = placemark.getElementsByTagName('description')[0];
  if (desc && desc.textContent) {
    // Try to regex parse a timestamp (e.g., YYYY-MM-DD HH:MM:SS)
    const match = desc.textContent.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/);
    if (match) return match[0];
  }

  // Fallback: Parse from the name if the name is a lenient datetime stamp!
  const nameEl = placemark.getElementsByTagName('name')[0];
  const nameText = nameEl?.textContent?.trim() || '';
  if (nameText) {
    const parsedDate = parseDateFromName(nameText);
    if (parsedDate) {
      return parsedDate.toISOString();
    }
  }

  return undefined;
}

// Helper to extract description from KML Placemark
function getPlacemarkDescription(placemark: Element): string | undefined {
  const desc = placemark.getElementsByTagName('description')[0];
  return desc?.textContent?.trim();
}

function getParentFolder(element: Element): Element | null {
  let parent = element.parentElement;
  while (parent) {
    if (parent.tagName === 'Folder') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function getParentFolderName(element: Element): string {
  const folder = getParentFolder(element);
  if (folder) {
    const nameEl = folder.getElementsByTagName('name')[0];
    return nameEl?.textContent?.trim() || 'Unnamed Folder';
  }
  return '';
}

function isDateTimeStamp(name: string): boolean {
  if (!name) return false;
  const cleaned = name.trim();
  
  // 1. Matches "YYYY-MM-DD HH:MM:SS" (and variants with slashes, T, timezones, e.g. PDT, UTC, Z)
  const isoPattern = /^\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\s*[A-Z]{3,4}|\s*[+-]\d{2,4}|Z)?$/i;
  
  // 2. Matches US/common "MM/DD/YYYY HH:MM:SS" or "M/D/YY H:MM:SS AM/PM"
  const commonPattern = /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}[ T]\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?(\s*[A-Z]{3,4})?$/i;

  // 3. Matches textual date with time: "Jul 28, 2026, 3:37:02 PM" or "28 Jul 2026 15:37"
  const textMonthPattern = /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}\s+,?\s*\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?(\s*[A-Z]{3,4})?$/i;
  const textMonthDayFirstPattern = /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\s+,?\s*\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?(\s*[A-Z]{3,4})?$/i;

  return (
    isoPattern.test(cleaned) ||
    commonPattern.test(cleaned) ||
    textMonthPattern.test(cleaned) ||
    textMonthDayFirstPattern.test(cleaned)
  );
}

function isLenientDateTimeStamp(name: string): boolean {
  if (!name) return false;
  const cleaned = name.trim();
  if (isDateTimeStamp(cleaned)) return true;

  const hasTime = /\d{1,2}:\d{2}/.test(cleaned);
  const hasDateSeparator = /[-/]/.test(cleaned);
  const hasWordMonth = /[A-Za-z]{3,}/.test(cleaned) && /\d{2,4}/.test(cleaned);
  
  return hasTime && (hasDateSeparator || hasWordMonth);
}

function getHaversineDistance(
  coord1?: { lat: number; lng: number },
  coord2?: { lat: number; lng: number }
): number {
  if (!coord1 || !coord2) return Infinity;
  const R = 6371000; // Radius of the Earth in meters
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Updates or creates the KML style of a placemark element to use a custom icon URL
 */
function setPlacemarkIcon(xmlDoc: Document, placemarkEl: Element, iconUrl: string) {
  const ns = xmlDoc.documentElement.namespaceURI || 'http://www.opengis.net/kml/2.2';
  
  // Remove any existing direct child styleUrl inside this placemark so our inline Style takes priority
  const children = Array.from(placemarkEl.childNodes);
  children.forEach(child => {
    if (child.nodeType === 1) { // Element node
      const el = child as Element;
      const localName = el.localName || el.tagName.split(':').pop();
      if (localName === 'styleUrl') {
        placemarkEl.removeChild(el);
      }
    }
  });

  // Look for any existing direct child Style element
  let styleEl: Element | null = null;
  for (const child of children) {
    if (child.nodeType === 1) {
      const el = child as Element;
      const localName = el.localName || el.tagName.split(':').pop();
      if (localName === 'Style') {
        styleEl = el;
        break;
      }
    }
  }

  if (!styleEl) {
    styleEl = xmlDoc.createElementNS(ns, 'Style');
    placemarkEl.appendChild(styleEl);
  }

  // Look for IconStyle inside Style
  let iconStyleEl: Element | null = null;
  const styleChildren = Array.from(styleEl.childNodes);
  for (const child of styleChildren) {
    if (child.nodeType === 1) {
      const el = child as Element;
      const localName = el.localName || el.tagName.split(':').pop();
      if (localName === 'IconStyle') {
        iconStyleEl = el;
        break;
      }
    }
  }

  if (!iconStyleEl) {
    iconStyleEl = xmlDoc.createElementNS(ns, 'IconStyle');
    styleEl.appendChild(iconStyleEl);
  }

  // Look for Icon inside IconStyle
  let iconEl: Element | null = null;
  const iconStyleChildren = Array.from(iconStyleEl.childNodes);
  for (const child of iconStyleChildren) {
    if (child.nodeType === 1) {
      const el = child as Element;
      const localName = el.localName || el.tagName.split(':').pop();
      if (localName === 'Icon') {
        iconEl = el;
        break;
      }
    }
  }

  if (!iconEl) {
    iconEl = xmlDoc.createElementNS(ns, 'Icon');
    iconStyleEl.appendChild(iconEl);
  }

  // Look for href inside Icon
  let hrefEl: Element | null = null;
  const iconChildren = Array.from(iconEl.childNodes);
  for (const child of iconChildren) {
    if (child.nodeType === 1) {
      const el = child as Element;
      const localName = el.localName || el.tagName.split(':').pop();
      if (localName === 'href') {
        hrefEl = el;
        break;
      }
    }
  }

  if (!hrefEl) {
    hrefEl = xmlDoc.createElementNS(ns, 'href');
    iconEl.appendChild(hrefEl);
  }

  hrefEl.textContent = iconUrl;
}

/**
 * Parse KMZ or KML file and modify first/last placemarks, as well as detecting gaps matching project numbers
 */
export async function processKMZ(
  file: File,
  startLabel: string,
  endLabel: string,
  method: LabelingMethod,
  projectNumbers: string[] = [],
  timeGapThresholdMinutes: number = 10,
  distanceThresholdMeters: number = 200,
  projectActivities: string[] = []
): Promise<{
  updatedBlob: Blob;
  placemarks: PlacemarkInfo[];
  kmlFileName: string;
}> {
  let kmlText = '';
  let kmlFileName = 'doc.kml';
  let isZipped = file.name.endsWith('.kmz');
  let zipInstance: JSZip | null = null;

  if (isZipped) {
    zipInstance = new JSZip();
    const zip = await zipInstance.loadAsync(file);
    
    // Find KML file inside zip
    const foundKmlKey = Object.keys(zip.files).find(name => name.endsWith('.kml'));
    if (!foundKmlKey) {
      throw new Error('No KML file found inside the KMZ archive.');
    }
    
    kmlFileName = foundKmlKey;
    kmlText = await zip.files[foundKmlKey].async('text');
  } else {
    kmlText = await file.text();
    kmlFileName = file.name;
  }

  // Parse KML as XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
  
  // Check for XML parsing errors
  const parseError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error('Error parsing KML content: ' + parseError.textContent);
  }

  // Find all Placemark elements
  const placemarkElements = Array.from(xmlDoc.getElementsByTagName('Placemark'));
  if (placemarkElements.length === 0) {
    throw new Error('No Placemarks found in the KML file.');
  }

  // Map ALL placemarks to our structure first, so they are kept and returned
  const rawPlacemarks: { element: Element; info: PlacemarkInfo; isTimestamp: boolean; folderElement: Element | null }[] = placemarkElements.map((el, index) => {
    const nameEl = el.getElementsByTagName('name')[0];
    const originalName = nameEl?.textContent?.trim() || `Placemark #${index + 1}`;
    const timestamp = getPlacemarkTimestamp(el);
    const coordinates = getPlacemarkCoordinates(el);
    const description = getPlacemarkDescription(el);
    const folderName = getParentFolderName(el);
    const folderElement = getParentFolder(el);
    const isTimestamp = isLenientDateTimeStamp(originalName);

    return {
      element: el,
      folderElement,
      isTimestamp,
      info: {
        id: `pm-${index}`,
        name: originalName,
        timestamp,
        coordinates,
        description,
        originalName,
        updatedName: originalName,
        folderName: folderName || undefined,
        isProcessed: false,
        isTargeted: false,
        isShiftStart: false,
        isShiftEnd: false,
        isJobActivityStart: false,
        isJobActivityEnd: false,
        isTimeGapStart: false,
        isTimeGapEnd: false,
        customIcon: undefined,
      }
    };
  });

  // Group by Folder to identify folder structures
  const folderGroups = new Map<Element | null, typeof rawPlacemarks>();
  rawPlacemarks.forEach(pm => {
    const group = folderGroups.get(pm.folderElement) || [];
    group.push(pm);
    folderGroups.set(pm.folderElement, group);
  });

  // Let's identify the targeted Samsara timestamp folder
  let targetGroup: typeof rawPlacemarks = [];
  let targetFolderName = '';

  // 1. First choice: Folder containing "samsara" and having at least one timestamp pin
  for (const [folderEl, group] of folderGroups.entries()) {
    if (folderEl) {
      const nameEl = folderEl.getElementsByTagName('name')[0];
      const folderName = nameEl?.textContent?.trim() || '';
      if (/samsara/i.test(folderName) && group.some(pm => pm.isTimestamp)) {
        targetGroup = group;
        targetFolderName = folderName;
        break;
      }
    }
  }

  // 2. Second choice: Folder with the maximum number of timestamp-like pins
  if (targetGroup.length === 0) {
    let maxTimestampCount = 0;
    let bestFolderEl: Element | null = null;

    for (const [folderEl, group] of folderGroups.entries()) {
      const count = group.filter(pm => pm.isTimestamp).length;
      if (count > maxTimestampCount) {
        maxTimestampCount = count;
        bestFolderEl = folderEl;
      }
    }

    if (bestFolderEl !== null) {
      targetGroup = folderGroups.get(bestFolderEl) || [];
      const nameEl = bestFolderEl.getElementsByTagName('name')[0];
      targetFolderName = nameEl?.textContent?.trim() || 'Samsara Logs';
    }
  }

  // 3. Fallback: If no folder had any timestamp pins, but there are some timestamp pins in the document root
  if (targetGroup.length === 0) {
    const documentTimestampCount = rawPlacemarks.filter(pm => pm.isTimestamp).length;
    if (documentTimestampCount > 0) {
      targetGroup = rawPlacemarks;
      targetFolderName = 'Document Root';
    }
  }

  // 4. Default: If absolutely no timestamp pins found anywhere, default to folder with most pins, or document root
  if (targetGroup.length === 0) {
    if (folderGroups.size > 0) {
      let maxCount = 0;
      let bestFolderEl: Element | null = null;
      for (const [folderEl, group] of folderGroups.entries()) {
        if (group.length > maxCount) {
          maxCount = group.length;
          bestFolderEl = folderEl;
        }
      }
      if (bestFolderEl) {
        targetGroup = folderGroups.get(bestFolderEl) || [];
        const nameEl = bestFolderEl.getElementsByTagName('name')[0];
        targetFolderName = nameEl?.textContent?.trim() || 'Samsara Logs';
      }
    } else {
      targetGroup = rawPlacemarks;
      targetFolderName = 'Document Root';
    }
  }

  // Filter targeted group to only include timestamp pins (these are the Samsara GPS track logs)
  const targetPlacemarks = targetGroup.filter(pm => pm.isTimestamp);

  // Set isTargeted flag on all pins belonging to the target set
  targetPlacemarks.forEach(pm => {
    pm.info.isTargeted = true;
  });

  // Sort them chronologically if timestamps are available
  const hasTimestamps = targetPlacemarks.some(p => p.info.timestamp !== undefined);
  if (hasTimestamps) {
    targetPlacemarks.sort((a, b) => {
      const timeA = a.info.timestamp ? new Date(a.info.timestamp).getTime() : 0;
      const timeB = b.info.timestamp ? new Date(b.info.timestamp).getTime() : 0;
      return timeA - timeB;
    });
  }

  const totalTargeted = targetPlacemarks.length;

  // Let's keep prefixes and suffixes to dynamically apply to each pin, preventing conflicts
  const pinPrefixes = new Map<string, string[]>();
  const pinSuffixes = new Map<string, string[]>();
  const pinReplace = new Map<string, string>();

  const addPrefix = (id: string, text: string) => {
    const arr = pinPrefixes.get(id) || [];
    if (!arr.includes(text)) {
      arr.push(text);
      pinPrefixes.set(id, arr);
    }
  };

  const addSuffix = (id: string, text: string) => {
    const arr = pinSuffixes.get(id) || [];
    if (!arr.includes(text)) {
      arr.push(text);
      pinSuffixes.set(id, arr);
    }
  };

  // 1. Label Shift Start & Shift End
  if (totalTargeted > 0) {
    const startPin = targetPlacemarks[0];
    const endPin = totalTargeted > 1 ? targetPlacemarks[totalTargeted - 1] : null;

    startPin.info.isShiftStart = true;
    startPin.info.isProcessed = true;
    startPin.info.customIcon = 'http://maps.google.com/mapfiles/kml/paddle/grn-stars.png';
    setPlacemarkIcon(xmlDoc, startPin.element, 'http://maps.google.com/mapfiles/kml/paddle/grn-stars.png');
    if (method === 'replace') {
      pinReplace.set(startPin.info.id, startLabel);
    } else if (method === 'prepend') {
      addPrefix(startPin.info.id, startLabel);
    } else {
      addSuffix(startPin.info.id, startLabel);
    }

    if (endPin) {
      endPin.info.isShiftEnd = true;
      endPin.info.isProcessed = true;
      endPin.info.customIcon = 'http://maps.google.com/mapfiles/kml/paddle/red-stars.png';
      setPlacemarkIcon(xmlDoc, endPin.element, 'http://maps.google.com/mapfiles/kml/paddle/red-stars.png');
      if (method === 'replace') {
        pinReplace.set(endPin.info.id, endLabel);
      } else if (method === 'prepend') {
        addPrefix(endPin.info.id, endLabel);
      } else {
        addSuffix(endPin.info.id, endLabel);
      }
    }
  }

  // 2. Identify Non-Samsara reference pins matching entered project numbers
  const cleanedProjectNumbers = projectNumbers
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Map project number to its selected activity
  const projectToActivityMap = new Map<string, string>();
  for (let j = 0; j < projectNumbers.length; j++) {
    const proj = projectNumbers[j].trim();
    if (proj) {
      const act = projectActivities[j] ? projectActivities[j].trim() : 'ACTIVITY';
      projectToActivityMap.set(proj, act || 'ACTIVITY');
    }
  }

  if (cleanedProjectNumbers.length > 0 && totalTargeted > 1) {
    const referencePins = rawPlacemarks.filter(pm => !pm.info.isTargeted);
    
    // Check if reference pin matches any project number
    const normalizeProjectString = (str: string): string => {
      return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    };

    const getMatchedProject = (pin: typeof rawPlacemarks[0]): string | undefined => {
      const pinName = pin.info.originalName.toUpperCase();
      const pinDesc = (pin.info.description || '').toUpperCase();
      const pinNameNorm = normalizeProjectString(pin.info.originalName);
      const pinDescNorm = normalizeProjectString(pin.info.description || '');

      for (const proj of cleanedProjectNumbers) {
        const projUpper = proj.toUpperCase();
        const projNorm = normalizeProjectString(proj);

        if (pinName.includes(projUpper) || pinDesc.includes(projUpper)) {
          return proj;
        }
        if (projNorm.length > 0 && (pinNameNorm.includes(projNorm) || pinDescNorm.includes(projNorm))) {
          return proj;
        }
      }
      return undefined;
    };

    const matchedReferencePins = referencePins
      .map(pm => ({ pm, project: getMatchedProject(pm) }))
      .filter(item => item.project !== undefined) as { pm: typeof rawPlacemarks[0]; project: string }[];

    // Detect time gaps and associate them with projects
    const gapThresholdMs = timeGapThresholdMinutes * 60 * 1000;
    const projectToGapsMap = new Map<string, typeof targetPlacemarks>();

    for (let i = 0; i < totalTargeted - 1; i++) {
      const pmStart = targetPlacemarks[i];
      const pmEnd = targetPlacemarks[i + 1];

      if (pmStart.info.timestamp && pmEnd.info.timestamp) {
        const tStart = new Date(pmStart.info.timestamp).getTime();
        const tEnd = new Date(pmEnd.info.timestamp).getTime();
        const diffMs = tEnd - tStart;

        if (diffMs >= gapThresholdMs) {
          // This is a time gap!
          pmStart.info.isTimeGapStart = true;
          pmStart.info.timeGapWithNextMin = Math.round(diffMs / (60 * 1000));
          pmEnd.info.isTimeGapEnd = true;

          // Find if there is any matching reference pin within the distance threshold.
          // If multiple reference pins are nearby, associate with the closest one.
          let closestProject: string | undefined = undefined;
          let minDistance = distanceThresholdMeters;

          matchedReferencePins.forEach(({ pm: refPin, project }) => {
            const distToStart = getHaversineDistance(pmStart.info.coordinates, refPin.info.coordinates);
            const distToEnd = getHaversineDistance(pmEnd.info.coordinates, refPin.info.coordinates);
            const distance = Math.min(distToStart, distToEnd);

            if (distance <= minDistance) {
              minDistance = distance;
              closestProject = project;
            }
          });

          if (closestProject) {
            const project = closestProject;
            if (!projectToGapsMap.has(project)) {
              projectToGapsMap.set(project, []);
            }
            const list = projectToGapsMap.get(project)!;
            if (!list.some(p => p.info.id === pmStart.info.id)) list.push(pmStart);
            if (!list.some(p => p.info.id === pmEnd.info.id)) list.push(pmEnd);
          }
        }
      }
    }

    // Identify the first gap pin and the last gap pin for each project, and label them
    projectToGapsMap.forEach((pins, project) => {
      if (pins.length > 0) {
        // Sort chronologically
        pins.sort((a, b) => {
          const tA = a.info.timestamp ? new Date(a.info.timestamp).getTime() : 0;
          const tB = b.info.timestamp ? new Date(b.info.timestamp).getTime() : 0;
          return tA - tB;
        });

        const firstGapPin = pins[0];
        const lastGapPin = pins[pins.length - 1];
        const activity = projectToActivityMap.get(project) || 'ACTIVITY';

        // Label first gap pin as START OF JOB ACTIVITY
        firstGapPin.info.isJobActivityStart = true;
        firstGapPin.info.jobActivityProject = project;
        firstGapPin.info.jobActivityName = activity;
        firstGapPin.info.isProcessed = true;
        firstGapPin.info.customIcon = 'https://maps.google.com/mapfiles/kml/shapes/cabs.png';
        setPlacemarkIcon(xmlDoc, firstGapPin.element, 'https://maps.google.com/mapfiles/kml/shapes/cabs.png');

        const startJobLabel = `(START OF JOB ${activity} ${project})`;
        if (method === 'replace') {
          pinReplace.set(firstGapPin.info.id, startJobLabel);
        } else if (method === 'prepend') {
          addPrefix(firstGapPin.info.id, startJobLabel);
        } else {
          addSuffix(firstGapPin.info.id, startJobLabel);
        }

        // Label last gap pin as END OF JOB ACTIVITY (if different from first, or if we have at least 2 pins)
        if (lastGapPin && (lastGapPin.info.id !== firstGapPin.info.id || pins.length > 1)) {
          lastGapPin.info.isJobActivityEnd = true;
          lastGapPin.info.jobActivityProject = project;
          lastGapPin.info.jobActivityName = activity;
          lastGapPin.info.isProcessed = true;
          lastGapPin.info.customIcon = 'https://maps.google.com/mapfiles/kml/shapes/cabs.png';
          setPlacemarkIcon(xmlDoc, lastGapPin.element, 'https://maps.google.com/mapfiles/kml/shapes/cabs.png');

          const endJobLabel = `(END OF JOB ${activity} ${project})`;
          if (method === 'replace') {
            pinReplace.set(lastGapPin.info.id, endJobLabel);
          } else if (method === 'prepend') {
            addPrefix(lastGapPin.info.id, endJobLabel);
          } else {
            addSuffix(lastGapPin.info.id, endJobLabel);
          }
        }
      }
    });
  }

  // 3. Assemble and apply all final names
  rawPlacemarks.forEach(pm => {
    const id = pm.info.id;
    let finalName = pm.info.originalName;

    if (pinReplace.has(id)) {
      finalName = pinReplace.get(id)!;
    } else {
      const prefixes = pinPrefixes.get(id) || [];
      const suffixes = pinSuffixes.get(id) || [];

      if (prefixes.length > 0) {
        finalName = `${prefixes.join(' ')} ${finalName}`;
      }
      if (suffixes.length > 0) {
        finalName = `${finalName} ${suffixes.join(' ')}`;
      }
    }

    if (finalName !== pm.info.originalName) {
      pm.info.updatedName = finalName;
      pm.info.name = finalName;

      // Update KML element
      const nameEl = pm.element.getElementsByTagName('name')[0];
      if (nameEl) {
        nameEl.textContent = finalName;
      } else {
        const newNameEl = xmlDoc.createElementNS(xmlDoc.documentElement.namespaceURI || '', 'name');
        newNameEl.textContent = finalName;
        pm.element.insertBefore(newNameEl, pm.element.firstChild);
      }
    }
  });

  // Sort rawPlacemarks so they align chronologically (for UI displays), or maintain original order
  const hasDocTimestamps = rawPlacemarks.some(p => p.info.timestamp !== undefined);
  if (hasDocTimestamps) {
    rawPlacemarks.sort((a, b) => {
      const timeA = a.info.timestamp ? new Date(a.info.timestamp).getTime() : 0;
      const timeB = b.info.timestamp ? new Date(b.info.timestamp).getTime() : 0;
      return timeA - timeB;
    });
  }

  // Serialize updated XML back to string
  const serializer = new XMLSerializer();
  const updatedKmlText = serializer.serializeToString(xmlDoc);

  let updatedBlob: Blob;

  if (isZipped && zipInstance) {
    zipInstance.file(kmlFileName, updatedKmlText);
    updatedBlob = await zipInstance.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.google-earth.kmz'
    });
  } else {
    updatedBlob = new Blob([updatedKmlText], { type: 'application/vnd.google-earth.kml+xml' });
  }

  return {
    updatedBlob,
    placemarks: rawPlacemarks.map(p => p.info),
    kmlFileName
  };
}

/**
 * Parse CSV and modify first/last rows
 */
export async function processCSV(
  file: File,
  startLabel: string,
  endLabel: string,
  method: LabelingMethod,
  targetColumnName?: string
): Promise<{
  updatedBlob: Blob;
  headers: string[];
  rows: CSVRow[];
  selectedColumn: string;
}> {
  const text = await file.text();
  const { headers, rows } = parseCSV(text);

  if (rows.length === 0) {
    throw new Error('CSV file has no data rows.');
  }

  // Attempt to autodetect a suitable column to label
  // Samsara or GPS logs usually have: name, remark, note, event, description, comment, labels, location, tag
  const possibleColumns = ['name', 'remark', 'note', 'event', 'description', 'comment', 'label', 'labels', 'activity', 'type'];
  let selectedColumn = targetColumnName || '';

  if (!selectedColumn) {
    // Find the first matching header in possible columns
    const found = headers.find(h => possibleColumns.includes(h.toLowerCase()));
    if (found) {
      selectedColumn = found;
    } else {
      // Default to first column or add a new column
      selectedColumn = headers.find(h => ['description', 'comment', 'event'].some(keyword => h.toLowerCase().includes(keyword))) || headers[0];
    }
  }

  // Let's modify first and last rows
  const totalRows = rows.length;
  
  rows.forEach((row, index) => {
    const isFirst = index === 0;
    const isLast = index === totalRows - 1 && totalRows > 1;

    if (isFirst || isLast) {
      const currentLabel = isFirst ? startLabel : endLabel;
      const originalValue = row[selectedColumn] || '';
      let updatedValue = originalValue;

      if (method === 'append') {
        updatedValue = originalValue ? `${originalValue} ${currentLabel}` : currentLabel;
      } else if (method === 'prepend') {
        updatedValue = originalValue ? `${currentLabel} ${originalValue}` : currentLabel;
      } else {
        updatedValue = currentLabel;
      }

      row[selectedColumn] = updatedValue;
    }
  });

  const updatedCSVText = serializeCSV(headers, rows);
  const updatedBlob = new Blob([updatedCSVText], { type: 'text/csv;charset=utf-8;' });

  return {
    updatedBlob,
    headers,
    rows,
    selectedColumn
  };
}

/**
 * Native CSV Parser
 */
export function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
  // Split lines but handle quoted multiline strings safely
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r' && !inQuotes) {
      // skip carriage returns
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  const rows: CSVRow[] = [];
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse columns respecting quotes
    const columns: string[] = [];
    let entry = '';
    let insideQuote = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        // Look ahead for double quotes which escape quotes in CSV
        if (j + 1 < line.length && line[j + 1] === '"') {
          entry += '"';
          j++; // skip next quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        columns.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    columns.push(entry.trim());

    if (i === 0 || headers.length === 0) {
      headers = columns.map(h => h.replace(/^"|"$/g, '') || `Column_${columns.indexOf(h) + 1}`);
    } else {
      const row: CSVRow = {};
      headers.forEach((header, index) => {
        row[header] = (columns[index] || '').replace(/^"|"$/g, '');
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

/**
 * Native CSV Serializer
 */
export function serializeCSV(headers: string[], rows: CSVRow[]): string {
  const escape = (val: string) => {
    let clean = val || '';
    if (clean.includes(',') || clean.includes('"') || clean.includes('\n') || clean.includes('\r')) {
      return `"${clean.replace(/"/g, '""')}"`;
    }
    return clean;
  };

  const headerLine = headers.map(escape).join(',');
  const rowLines = rows.map(row => headers.map(h => escape(row[h] || '')).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}
