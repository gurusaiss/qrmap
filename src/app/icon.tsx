import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Code-generated favicon — no binary asset to keep in sync with the brand colour. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1D4ED8',
          borderRadius: 7,
          color: 'white',
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        M
      </div>
    ),
    size,
  );
}
