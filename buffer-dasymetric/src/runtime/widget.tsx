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

// Buffer distance in meters (example: 5000m = 5km)
const BUFFER_DISTANCE_METERS = 5000;

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

    // 🚀 **Step 2: Create Buffer in Meters**
    let bufferPolygon: Polygon | null = null;
    try {
      console.log(`🔄 Creating buffer of ${BUFFER_DISTANCE_METERS} meters...`);
      const buffer = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCE_METERS, "meters");

      if (!buffer || buffer.type !== "polygon") {
        throw new Error(`Buffer creation failed. Expected 'polygon', got '${buffer?.type || "undefined"}'`);
      }

      bufferPolygon = buffer as Polygon;
      console.log("✅ Buffer Created Successfully:", bufferPolygon);
    } catch (error) {
      console.error("❌ Buffer Creation Failed:", error);
      setState({ ...state, errorMessage: "Error creating buffer.", isLoading: false });
      return;
    }

    // 🚀 **Step 3: Add Point & Buffer to the Map**
    let bufferLayer = state.jimuMapView.view.map.findLayerById("buffer-layer") as GraphicsLayer;
    if (!bufferLayer) {
      bufferLayer = new GraphicsLayer({ id: "buffer-layer" });
      state.jimuMapView.view.map.add(bufferLayer);
    }
    bufferLayer.removeAll(); // Clear old graphics

    const pointGraphic = new Graphic({
      geometry: projectedPoint,
      symbol: {
        type: "simple-marker",
        color: [0, 0, 255], // Blue point
        size: "10px",
        outline: { color: [0, 0, 0], width: 1 }
      }
    });

    const bufferGraphic = new Graphic({
      geometry: bufferPolygon,
      symbol: new SimpleFillSymbol({
        color: [255, 0, 0, 0.3], // Red transparent fill
        outline: { color: [255, 0, 0], width: 1 }
      }),
    });

    bufferLayer.add(pointGraphic);
    bufferLayer.add(bufferGraphic);
    console.log("✅ Buffer & Point Added to Map");

    setState({ ...state, isLoading: false });
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: "10px" }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />

      <div style={{ marginTop: "10px" }}>
        <h4>Enter Coordinates and Site Name</h4>
        <TextInput
          placeholder="Latitude"
          value={state.latitude}
          onChange={(e) => setState({ ...state, latitude: e.target.value })}
          style={{ marginRight: "10px", width: "150px" }}
        />
        <TextInput
          placeholder="Longitude"
          value={state.longitude}
          onChange={(e) => setState({ ...state, longitude: e.target.value })}
          style={{ marginRight: "10px", width: "150px" }}
        />
        <TextInput
          placeholder="Site Name"
          value={state.siteName}
          onChange={(e) => setState({ ...state, siteName: e.target.value })}
          style={{ marginRight: "10px", width: "150px" }}
        />
        <Button onClick={processPoint} disabled={state.isLoading}>
          {state.isLoading ? "Processing..." : "Add Buffer to Map"}
        </Button>
      </div>

      {state.errorMessage && (
        <Alert
          type="error"
          text={state.errorMessage}
          withIcon
          closable
          onClose={() => setState({ ...state, errorMessage: null })}
        />
      )}
    </div>
  );
};

export default Widget;
