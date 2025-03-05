import { React, type AllWidgetProps } from 'jimu-core'; 
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import * as projection from '@arcgis/core/geometry/projection';
import { TextInput, Button, Alert } from 'jimu-ui';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';

// Configuration interface for buffer distances
interface IConfig {
  bufferDistances: number[];
}

// State interface for the widget
interface IState {
  jimuMapView: JimuMapView | null;
  latitude: string;
  longitude: string;
  siteName: string;
  errorMessage: string | null;
  isLoading: boolean;
}

// Convert miles to meters (1 mile = 1609.34 meters)
const BUFFER_DISTANCES_MILES = [0.25, 0.5, 1, 2, 3, 4];
const BUFFER_DISTANCES_METERS = BUFFER_DISTANCES_MILES.map((miles) => miles * 1609.34);

// Colors for each buffer (from inner to outer)
const BUFFER_COLORS = [
  [255, 0, 0, 0.3],  // Red
  [255, 165, 0, 0.3], // Orange
  [255, 255, 0, 0.3], // Yellow
  [0, 128, 0, 0.3],   // Green
  [0, 0, 255, 0.3],   // Blue
  [128, 0, 128, 0.3]  // Purple
];

const Widget = (props: AllWidgetProps<IConfig>) => {
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null,
    isLoading: false,
  });

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log("🌍 MapView Activated:", jmv);
    if (!jmv) {
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
  };

  const processPoint = async () => {
    const { latitude, longitude } = state;

    if (!latitude.trim() || !longitude.trim()) {
      setState({ ...state, errorMessage: "Please enter both latitude and longitude." });
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setState({
        ...state,
        errorMessage: "Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180.",
      });
      return;
    }

    const point = new Point({
      latitude: lat,
      longitude: lon,
      spatialReference: { wkid: 4326 }, // WGS84
    });

    await processBuffer(point);
  };

  const processBuffer = async (point: Point) => {
    console.log("📍 Processing Point:", point);

    if (!state.jimuMapView) {
      setState({ ...state, errorMessage: "Map view not loaded. Add a Map widget." });
      return;
    }

    setState({ ...state, isLoading: true, errorMessage: null });

    console.log("🔄 Loading Projection Engine...");
    await projection.load();
    console.log("✅ Projection Engine Loaded.");

    const mapSR = state.jimuMapView.view.spatialReference;
    console.log("🌍 Map Spatial Reference:", mapSR);

    let projectedPoint: Point | null = null;
    try {
      console.log("🔄 Projecting Point...");
      const projected = projection.project(point, mapSR);
      console.log("🔍 Projected Result:", projected);

      if (!projected || projected.type !== "point") {
        throw new Error("Projection failed or returned invalid type.");
      }

      projectedPoint = projected as Point;
      console.log("✅ Projected Point Confirmed:", projectedPoint);
    } catch (projError) {
      console.error("❌ Projection Failed:", projError);
      setState({ ...state, errorMessage: "Failed to project point to map spatial reference.", isLoading: false });
      return;
    }

    // 🚀 **Step 2: Create Multiple Buffers**
    let buffers: Polygon[] = [];
    for (let i = 0; i < BUFFER_DISTANCES_METERS.length; i++) {
      try {
        console.log(`🔄 Creating buffer at ${BUFFER_DISTANCES_MILES[i]} miles (${BUFFER_DISTANCES_METERS[i]} meters)...`);
        const buffer = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[i], "meters");

        if (!buffer || buffer.type !== "polygon") {
          throw new Error(`Buffer creation failed for ${BUFFER_DISTANCES_MILES[i]} miles.`);
        }

        buffers.push(buffer as Polygon);
        console.log(`✅ Buffer ${BUFFER_DISTANCES_MILES[i]} miles created.`);
      } catch (error) {
        console.error(`❌ Buffer Creation Failed for ${BUFFER_DISTANCES_MILES[i]} miles:`, error);
      }
    }

    if (buffers.length === 0) {
      setState({ ...state, errorMessage: "Error: No valid buffers were created.", isLoading: false });
      return;
    }

    // 🚀 **Step 3: Add Buffers & Point to the Map**
    let bufferLayer = state.jimuMapView.view.map.findLayerById("buffer-layer") as GraphicsLayer;
    if (!bufferLayer) {
      bufferLayer = new GraphicsLayer({ id: "buffer-layer" });
      state.jimuMapView.view.map.add(bufferLayer);
    }
    bufferLayer.removeAll(); // Clear old graphics

    // Add point
    const pointGraphic = new Graphic({
      geometry: projectedPoint,
      symbol: {
        type: "simple-marker",
        color: [0, 0, 255], // Blue point
        size: "10px",
        outline: { color: [0, 0, 0], width: 1 }
      }
    });

    bufferLayer.add(pointGraphic);

    // Add buffers
    buffers.forEach((buffer, index) => {
      const bufferGraphic = new Graphic({
        geometry: buffer,
        symbol: new SimpleFillSymbol({
          color: BUFFER_COLORS[index], // Different color per buffer
          outline: { color: [0, 0, 0], width: 1 }
        }),
      });

      bufferLayer.add(bufferGraphic);
      console.log(`✅ Buffer ${BUFFER_DISTANCES_MILES[index]} miles added to map.`);
    });

    console.log("✅ All Buffers & Point Added to Map");
    setState({ ...state, isLoading: false });
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: "10px" }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />

      <TextInput placeholder="Latitude" value={state.latitude} onChange={(e) => setState({ ...state, latitude: e.target.value })} />
      <TextInput placeholder="Longitude" value={state.longitude} onChange={(e) => setState({ ...state, longitude: e.target.value })} />
      <Button onClick={processPoint} disabled={state.isLoading}>
        {state.isLoading ? "Processing..." : "Add Buffers to Map"}
      </Button>

      {state.errorMessage && <Alert type="error" text={state.errorMessage} withIcon closable onClose={() => setState({ ...state, errorMessage: null })} />}
    </div>
  );
};

export default Widget;
