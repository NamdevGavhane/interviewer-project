import { useState } from 'react';

/**
 * Reusable dynamic Avatar component with deterministic color and initials fallback.
 * Automatically falls back to initials if avatar URL is missing, invalid, or fails to load.
 */
const Avatar = ({ 
  name = 'User', 
  avatar = '', 
  size = 36, 
  className = '', 
  style = {} 
}) => {
  const [imageError, setImageError] = useState(false);

  // Generate deterministic pastel background color based on name
  const getAvatarBg = (str) => {
    const colors = [
      '#1a73e8', // Blue
      '#7c3aed', // Purple
      '#059669', // Emerald
      '#d97706', // Amber
      '#dc2626', // Red
      '#0891b2', // Cyan
      '#4f46e5'  // Indigo
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const getInitials = (str) => {
    if (!str) return 'IP';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const dimension = typeof size === 'number' ? `${size}px` : size;
  const fontSize = typeof size === 'number' ? `${Math.round(size * 0.4)}px` : '0.85rem';

  const hasValidImage = Boolean(avatar && !imageError && typeof avatar === 'string' && avatar.trim().length > 5);

  if (hasValidImage) {
    return (
      <img
        src={avatar}
        alt={name}
        onError={() => setImageError(true)}
        className={`profile-avatar ${className}`}
        style={{
          width: dimension,
          height: dimension,
          borderRadius: '50%',
          objectFit: 'cover',
          ...style
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: '50%',
        backgroundColor: getAvatarBg(name),
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize,
        flexShrink: 0,
        userSelect: 'none',
        ...style
      }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
};

export default Avatar;
