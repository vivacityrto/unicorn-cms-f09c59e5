/**
 * Utility functions for parsing and formatting addresses
 */

export interface ParsedAddress {
  address1: string;
  address2: string;
  suburb: string;
  state: string;
  postcode: string;
}

/**
 * Parse a full address string into component parts
 * Attempts to identify Australian address components
 */
export function parseAddress(fullAddress: string): ParsedAddress {
  if (!fullAddress?.trim()) {
    return {
      address1: '',
      address2: '',
      suburb: '',
      state: '',
      postcode: ''
    };
  }

  const trimmed = fullAddress.trim();
  
  // Detect format: comma-separated (TGA) vs newline-separated (manual entry)
  const hasCommas = trimmed.includes(',');
  const hasNewlines = trimmed.includes('\n');
  
  let address1 = '';
  let address2 = '';
  let suburb = '';
  let state = '';
  let postcode = '';

  if (hasCommas && !hasNewlines) {
    // ===== COMMA-SEPARATED FORMAT (TGA Integration) =====
    // Example: "Unit 2, 14 William St, BROOKVALE, NSW, 2100, Australia"
    
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    let index = parts.length - 1;
    
    // 1. Remove "Australia" if present (working from right)
    if (index >= 0 && parts[index].toUpperCase() === 'AUSTRALIA') {
      index--;
    }
    
    // 2. Extract postcode (any digits - not just 4)
    if (index >= 0 && /^\d+$/.test(parts[index])) {
      postcode = parts[index];
      index--;
    }
    
    // 3. Extract state (NSW, VIC, QLD, WA, SA, TAS, NT, ACT)
    if (index >= 0 && /^(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)$/i.test(parts[index])) {
      state = parts[index].toUpperCase();
      index--;
    }
    
    // 4. Extract suburb
    if (index >= 0) {
      suburb = parts[index].toUpperCase();
      index--;
    }
    
    // 5. Remaining parts are address lines
    if (index >= 0) {
      if (index === 0) {
        // Only one part left - it's the street address
        address1 = parts[0];
        address2 = '';
      } else {
        // Multiple parts - everything except last is address1, last is address2
        address1 = parts.slice(0, index).join(', ');
        address2 = parts[index];
      }
    }
  } else {
    // ===== NEWLINE-SEPARATED FORMAT (Manual Entry) =====
    // Keep existing logic for backward compatibility
    const lines = trimmed.split('\n').map(line => line.trim()).filter(Boolean);
    
    if (lines.length === 0) {
      return { address1: '', address2: '', suburb: '', state: '', postcode: '' };
    }

    // Australian street types for pattern matching
    const streetTypes = ['STREET', 'ST', 'ROAD', 'RD', 'DRIVE', 'DR', 'AVENUE', 'AVE', 'LANE', 'LN', 'COURT', 'CT', 'PLACE', 'PL', 'CRESCENT', 'CRES', 'CIRCUIT', 'CIR', 'BOULEVARD', 'BLVD', 'TERRACE', 'TCE', 'PARADE', 'PDE', 'HIGHWAY', 'HWY', 'WAY', 'CLOSE', 'CL'];

    // Last line typically contains suburb, state, postcode
    const lastLine = lines[lines.length - 1];
    
    // Try to extract postcode (any digits at the end - not just 4)
    const postcodeMatch = lastLine.match(/\b(\d+)\s*$/);
    if (postcodeMatch) {
      postcode = postcodeMatch[1];
    }
    
    // Try to extract state (before postcode)
    const stateMatch = lastLine.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)(?:\s+\d+)?\s*$/i);
    if (stateMatch) {
      state = stateMatch[1].toUpperCase();
    }

    // Extract suburb by removing state and postcode from the end
    let workingLine = lastLine;
    if (postcode) {
      workingLine = workingLine.replace(new RegExp(`\\s*${postcode}\\s*$`), '').trim();
    }
    if (state) {
      workingLine = workingLine.replace(new RegExp(`\\s*${state}\\s*$`, 'i'), '').trim();
    }

    // Handle address lines
    if (lines.length === 1) {
      // Single line - need to split street address from suburb
      
      // Try to find where street address ends by looking for street type
      let streetEndIndex = -1;
      const words = workingLine.split(/\s+/);
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i].toUpperCase();
        if (streetTypes.includes(word)) {
          streetEndIndex = i;
          break;
        }
      }
      
      if (streetEndIndex >= 0) {
        // Found a street type, everything up to and including it is the street address
        address2 = words.slice(0, streetEndIndex + 1).join(' ');
        suburb = words.slice(streetEndIndex + 1).join(' ');
      } else {
        // No street type found, try to guess based on pattern
        if (words.length >= 3) {
          address2 = words.slice(0, 2).join(' ');
          suburb = words.slice(2).join(' ');
        } else {
          address2 = workingLine;
          suburb = '';
        }
      }
    } else if (lines.length === 2) {
      address1 = lines[0];
      suburb = workingLine;
    } else if (lines.length === 3) {
      address1 = lines[0];
      address2 = lines[1];
      suburb = workingLine;
    } else {
      address1 = lines[0];
      address2 = lines.slice(1, -1).join(', ');
      suburb = workingLine;
    }
  }

  return {
    address1: address1.trim(),
    address2: address2.trim(),
    suburb: suburb.trim().toUpperCase(),
    state: state.trim(),
    postcode: postcode.trim()
  };
}

/**
 * Format address components back into a full address string
 */
export function formatAddress(address: ParsedAddress): string {
  const parts: string[] = [];
  
  if (address.address1?.trim()) {
    parts.push(address.address1.trim());
  }
  
  if (address.address2?.trim()) {
    parts.push(address.address2.trim());
  }
  
  // Build suburb/state/postcode line
  const locationParts: string[] = [];
  if (address.suburb?.trim()) {
    locationParts.push(address.suburb.trim());
  }
  if (address.state?.trim()) {
    locationParts.push(address.state.trim().toUpperCase());
  }
  if (address.postcode?.trim()) {
    locationParts.push(address.postcode.trim());
  }
  
  if (locationParts.length > 0) {
    parts.push(locationParts.join(' '));
  }
  
  return parts.join('\n');
}

/**
 * Format address as a single line for display
 */
export function formatAddressLine(address: {
  address1?: string | null;
  address2?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}): string {
  const parts: string[] = [];
  
  if (address.address1?.trim()) {
    parts.push(address.address1.trim());
  }
  
  if (address.address2?.trim()) {
    parts.push(address.address2.trim());
  }
  
  // Build suburb/state/postcode
  const locationParts: string[] = [];
  if (address.suburb?.trim()) {
    locationParts.push(address.suburb.trim());
  }
  if (address.state?.trim()) {
    locationParts.push(address.state.trim().toUpperCase());
  }
  if (address.postcode?.trim()) {
    locationParts.push(address.postcode.trim());
  }
  
  if (locationParts.length > 0) {
    parts.push(locationParts.join(' '));
  }
  
  return parts.join(', ');
}
