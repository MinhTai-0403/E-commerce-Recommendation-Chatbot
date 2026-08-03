import { useEffect, useRef, useState } from "react";

let mapsLoader;

function loadGoogleMaps(apiKey) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=beta&loading=async`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Không tải được Google Maps JavaScript API"));
    document.head.appendChild(script);
  });
  return mapsLoader;
}

export default function GoogleMaps3D({ stores = [], selectedStore, fallbackUrl }) {
  const hostRef = useRef(null);
  const [error, setError] = useState("");
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey || !selectedStore || !hostRef.current) return undefined;
    let cancelled = false;
    const host = hostRef.current;
    loadGoogleMaps(apiKey).then(async (maps) => {
      const { Map3DElement, Marker3DElement } = await maps.importLibrary("maps3d");
      if (cancelled) return;
      host.replaceChildren();
      const map = new Map3DElement({ center: { lat: Number(selectedStore.latitude), lng: Number(selectedStore.longitude), altitude: 0 }, range: 1250, tilt: 62, heading: 20, mode: "HYBRID" });
      stores.filter((store) => Number.isFinite(Number(store.latitude)) && Number.isFinite(Number(store.longitude))).slice(0, 60).forEach((store) => {
        const marker = new Marker3DElement({ position: { lat: Number(store.latitude), lng: Number(store.longitude), altitude: 0 }, title: store.name, altitudeMode: "RELATIVE_TO_GROUND", extruded: store.id === selectedStore.id });
        marker.addEventListener("gmp-click", () => map.flyCameraTo({ endCamera: { center: marker.position, range: 850, tilt: 65, heading: 20 }, durationMillis: 900 }));
        map.append(marker);
      });
      host.append(map);
    }).catch((loadError) => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; host.replaceChildren(); };
  }, [apiKey, selectedStore, stores]);

  if (!apiKey || error || !Number.isFinite(Number(selectedStore?.latitude))) {
    return fallbackUrl ? <iframe title={`Bản đồ ${selectedStore?.name || "CellphoneS"}`} src={fallbackUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /> : null;
  }
  return <div className="store-locator-google-3d" ref={hostRef} aria-label="Google Maps 3D các cửa hàng CellphoneS" />;
}
