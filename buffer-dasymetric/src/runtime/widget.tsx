import { React, type AllWidgetProps } from 'jimu-core'; 
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import * as projection from '@arcgis/core/geometry/projection';
import { TextInput, Button, Alert } from 'jimu-ui';
import * as Papa from 'papaparse';
import { saveAs } from 'file-saver';
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
  bufferResults: any[];
}

// Conversion constant: 1 mile = 1609.34 meters
const MILES_TO_METERS = 1609.34;

const Widget = (props: AllWidgetProps<IConfig>) => {
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null,
    isLoading: false,
    bufferResults: [],
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

    if (!state.siteName.trim()) {
      setState({ ...state, errorMessage: "Please enter a site name." });
      return;
    }

    setState({ ...state, isLoading: true, errorMessage: null });

    const bufferDistances = props.config?.bufferDistances || [0.25, 0.5, 1, 2, 3, 4];

    let buffers: __esri.Polygon[];
    try {
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
        setState({
          ...state,
          errorMessage: "Failed to project point to map spatial reference.",
          isLoading: false,
        });
        return;
      }

      buffers = bufferDistances.map((distance) => {
        console.log(`🔄 Attempting to buffer at ${distance} miles...`);
        try {
          const buffer = geometryEngine.buffer(projectedPoint, distance * MILES_TO_METERS, "meters");

          if (!buffer || buffer.type !== "polygon") {
            console.error(`❌ Buffer failed at ${distance} miles.`);
            return null;
          }

          console.log("✅ Valid Buffer Created:", buffer);
          return buffer as Polygon;
        } catch (error) {
          console.error(`❌ Exception during buffering at ${distance} miles:`, error);
          return null;
        }
      }).filter((buffer): buffer is Polygon => !!buffer);

      if (buffers.length === 0) {
        console.error("❌ No valid buffers were created.");
        setState({ ...state, errorMessage: "Error: No valid buffers were created.", isLoading: false });
        return;
      }
    } catch (error) {
      console.error("❌ Buffering Error:", error);
      setState({ ...state, errorMessage: `Error processing data: ${error.message}`, isLoading: false });
      return;
    }

    console.log("✅ Buffers created successfully:", buffers);

    setState({ ...state, isLoading: false, errorMessage: null });
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
          {state.isLoading ? "Processing..." : "Buffer Coordinates"}
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

