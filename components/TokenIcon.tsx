import React, { useState } from 'react';

interface TokenIconProps {
  symbol: string;
  size?: string | number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  aToken?: boolean;
  waToken?: boolean;
}

export default function TokenIcon({ 
  symbol, 
  size = "24px", 
  className, 
  style, 
  alt,
  aToken = false,
  waToken = false 
}: TokenIconProps) {
  const [imageError, setImageError] = useState(false);
  
  // Get the icon name from the symbol, similar to the interface project
  const getIconName = (assetSymbol: string) => {
    if (!assetSymbol) return "";
    
    let iconName = assetSymbol.toLowerCase();
    
    // Handle special PT (Principal Token) cases
    if (iconName.includes("pt-")) {
      // Extract the base token from PT tokens
      // e.g., "PT-eUSDE-14AUG2025" -> "eusde"
      // e.g., "PT-sUSDE-25SEP2025" -> "susde" 
      // e.g., "PT-USDe-31JUL2025" -> "usde"
      const ptMatch = iconName.match(/pt-(.+?)-/);
      if (ptMatch) {
        iconName = ptMatch[1];
      }
    }
    
    // Handle Ethereal/Ethena tokens
    if (iconName.includes("ethereal") || iconName.includes("ethena")) {
      // Extract the base token from the long name
      // e.g., "PT Ethereal eUSDE 14AUG2025" -> "eusde"
      // e.g., "PT Ethena sUSDE 25SEP2025" -> "susde"
      const etherealMatch = iconName.match(/(eusde|susde|usde)/);
      if (etherealMatch) {
        iconName = etherealMatch[1];
      }
    }
    
    // Apply standard transformations
    iconName = iconName
      .replace(".e", "")
      .replace(".b", "")
      .replace("m.", "")
      .replace("btcb", "btc");
    
    return iconName;
  };

  const iconName = getIconName(symbol);
  const fallbackIcon = imageError ? 'default' : iconName;

  // Handle aToken and waToken styling
  const getTokenRingStyle = () => {
    if (aToken || waToken) {
      return {
        position: 'relative' as const,
        display: 'inline-block',
        borderRadius: '50%',
        background: waToken 
          ? 'repeating-linear-gradient(45deg, #b6509e, #b6509e 4px, #2ebac6 4px, #2ebac6 8px)'
          : 'linear-gradient(135deg, #b6509e 0%, #2ebac6 100%)',
        padding: '2px',
        ...style
      };
    }
    return style;
  };

  const getImageStyle = () => {
    const baseStyle = {
      width: size,
      height: size,
      borderRadius: '50%',
      display: 'block'
    };

    if (aToken || waToken) {
      return {
        ...baseStyle,
        width: `calc(${size} - 4px)`,
        height: `calc(${size} - 4px)`,
        margin: '2px'
      };
    }

    return baseStyle;
  };

  if (aToken || waToken) {
    return (
      <div 
        className={className}
        style={getTokenRingStyle()}
      >
        <img
          src={`/icons/tokens/${fallbackIcon}.svg`}
          alt={alt || `${symbol} icon`}
          style={getImageStyle()}
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <img
      src={`/icons/tokens/${fallbackIcon}.svg`}
      alt={alt || `${symbol} icon`}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        ...style
      }}
      onError={() => setImageError(true)}
    />
  );
}
