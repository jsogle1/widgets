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

  const processPoint = async (point: Point) => {
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

    console.log("🔄 Finding Census Layer...");
    const censusLayer = state.jimuMapView.view.map.allLayers.find(
      (layer) => layer.title === "CensusBlocks2010"
    ) as FeatureLayer;

    if (!censusLayer) {
      console.error("❌ Census layer not found.");
      setState({
        ...state,
        errorMessage: "Census layer (CensusBlocks2010) not found in the map.",
        isLoading: false,
      });
      return;
    }

    console.log("✅ Census Layer Found:", censusLayer);

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

        if (!projected) throw new Error("Projection returned null.");
        if (projected.type !== "point") throw new Error(`Invalid projected type: ${projected.type}`);

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

      console.log("🌍 Map Spatial Reference Before Buffering:", projectedPoint.spatialReference);

      buffers = bufferDistances.map((distance) => {
        console.log(`🔄 Attempting to buffer at ${distance} miles...`);
        try {
          const buffer = geometryEngine.buffer(projectedPoint as Point, distance * MILES_TO_METERS, "meters");

          console.log("🔍 Raw Buffer Output:", buffer);

          if (!buffer) {
            console.error(`❌ Buffer creation failed at ${distance} miles - buffer returned undefined.`);
            return null;
          }

          const validBuffer = Array.isArray(buffer) ? buffer[0] : buffer;

          if (!validBuffer || validBuffer.type !== "polygon") {
            console.error(`❌ Buffer rejected: Expected 'polygon', got '${validBuffer?.type}'`);
            return null;
          }

          console.log("✅ Valid Buffer Created:", validBuffer);
          return validBuffer as Polygon;
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

    console.log("🔄 Querying Census Layer...");
    const lastBuffer = buffers.length > 0 ? buffers[buffers.length - 1] : null;

    if (!lastBuffer) {
      console.error("❌ Error: No valid buffer found for query.");
      setState({ ...state, errorMessage: "Error: No valid buffer found for query.", isLoading: false });
      return;
    }

    // Ensure spatial reference exists
    if (!lastBuffer.spatialReference || !lastBuffer.spatialReference.wkid) {
      console.warn("⚠️ Warning: Buffer is missing spatial reference. Assigning map's SR.");
      lastBuffer.spatialReference = state.jimuMapView?.view.spatialReference;
    }

    console.log("✅ Final Buffer Type:", lastBuffer?.type);
    console.log("🌍 Final Buffer Spatial Reference:", lastBuffer.spatialReference);

    if (lastBuffer.type !== "polygon") {
      console.error(`❌ Invalid buffer type for query. Expected 'polygon', got '${lastBuffer.type}'`);
      setState({ ...state, errorMessage: `Error: Invalid buffer type for query.`, isLoading: false });
      return;
    }

    console.log("✅ Using buffer for query:", lastBuffer);

    const query = censusLayer.createQuery();
    query.geometry = lastBuffer as Polygon;
    console.log("✅ Query Geometry Set:", query.geometry);
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: "10px" }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />

      <TextInput placeholder="Latitude" value={state.latitude} onChange={(e) => setState({ ...state, latitude: e.target.value })} />
      <TextInput placeholder="Longitude" value={state.longitude} onChange={(e) => setState({ ...state, longitude: e.target.value })} />
      <TextInput placeholder="Site Name" value={state.siteName} onChange={(e) => setState({ ...state, siteName: e.target.value })} />
      <Button onClick={() => processPoint(new Point({ latitude: parseFloat(state.latitude), longitude: parseFloat(state.longitude), spatialReference: { wkid: 4326 } }))} disabled={state.isLoading}>
        {state.isLoading ? "Processing..." : "Buffer Coordinates"}
      </Button>

      {state.errorMessage && <Alert type="error" text={state.errorMessage} withIcon closable onClose={() => setState({ ...state, errorMessage: null })} />}
    </div>
  );
};

export default Widget;
