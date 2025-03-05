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

      console.log("📏 Creating Buffers...");
      buffers = bufferDistances.map((distance) => {
        console.log(`🔄 Buffering at ${distance} miles...`);
        const buffer = geometryEngine.buffer(projectedPoint as Point, distance * MILES_TO_METERS, "meters");
        console.log("🔍 Buffer Output:", buffer);

        if (!buffer) {
          console.error(`❌ Buffer failed at distance: ${distance}`);
          return null;
        }
        if (buffer.type !== "polygon") {
          console.error(`❌ Buffer returned invalid type: ${buffer.type}`);
          return null;
        }
        return buffer as Polygon;
      }).filter((buffer): buffer is Polygon => !!buffer);

      console.log("✅ Final Buffers List:", buffers);

      if (buffers.length === 0) {
        throw new Error("No valid buffers were created.");
      }
    } catch (error) {
      console.error("❌ Buffering Error:", error);
      setState({ ...state, errorMessage: `Error processing data: ${error.message}`, isLoading: false });
      return;
    }

    console.log("🔄 Querying Census Layer...");
    const query = censusLayer.createQuery();
    query.geometry = buffers[buffers.length - 1] as Polygon;
    console.log("✅ Query Geometry Set:", query.geometry);

    query.outFields = ["TOTALPOP", "ACRES"];

    try {
      const result = await censusLayer.queryFeatures(query);
      console.log("✅ Query Result:", result);

      if (!result.features.length) {
        setState({ ...state, errorMessage: "No census features found within the largest buffer.", isLoading: false });
        return;
      }

      setState({ ...state, isLoading: false, errorMessage: null });

    } catch (error) {
      console.error("❌ Query Processing Error:", error);
      setState({ ...state, errorMessage: `Error processing data: ${error.message}`, isLoading: false });
    }
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: "10px" }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />

      <div style={{ marginTop: "10px" }}>
        <h4>Enter Coordinates and Site Name</h4>
        <TextInput placeholder="Latitude" value={state.latitude} onChange={(e) => setState({ ...state, latitude: e.target.value })} />
        <TextInput placeholder="Longitude" value={state.longitude} onChange={(e) => setState({ ...state, longitude: e.target.value })} />
        <TextInput placeholder="Site Name" value={state.siteName} onChange={(e) => setState({ ...state, siteName: e.target.value })} />
        <Button onClick={() => processPoint(new Point({ latitude: parseFloat(state.latitude), longitude: parseFloat(state.longitude), spatialReference: { wkid: 4326 } }))} disabled={state.isLoading}>
          {state.isLoading ? "Processing..." : "Buffer Coordinates"}
        </Button>
      </div>

      {state.errorMessage && <Alert type="error" text={state.errorMessage} withIcon closable onClose={() => setState({ ...state, errorMessage: null })} />}
    </div>
  );
};

export default Widget;
