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
import Query from '@arcgis/core/rest/support/Query';

// Convert miles to meters (1 mile = 1609.34 meters)
const BUFFER_DISTANCES_MILES = [0.25, 0.5, 1, 2, 3, 4];
const BUFFER_DISTANCES_METERS = BUFFER_DISTANCES_MILES.map((miles) => miles * 1609.34);

// Colors for each buffer
const BUFFER_COLORS = [
  [255, 0, 0, 0.4],  // Red
  [255, 165, 0, 0.4], // Orange
  [255, 255, 0, 0.4], // Yellow
  [0, 128, 0, 0.4],   // Green
  [0, 0, 255, 0.4],   // Blue
  [128, 0, 128, 0.4]  // Purple
];

const Widget = (props: AllWidgetProps<any>) => {
  const [state, setState] = React.useState({
    jimuMapView: null as JimuMapView | null,
    latitude: '',
    longitude: '',
    errorMessage: null as string | null,
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
      setState({ ...state, errorMessage: "Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180." });
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

    // 🚀 **Step 2: Ensure Buffer Layer Exists**
    let bufferLayer = state.jimuMapView.view.map.findLayerById("buffer-layer") as GraphicsLayer;
    if (!bufferLayer) {
      bufferLayer = new GraphicsLayer({ id: "buffer-layer" });
      state.jimuMapView.view.map.add(bufferLayer);
    }
    bufferLayer.removeAll(); // Clear previous graphics

    // **Add Point to Map**
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
    console.log("✅ Point Added to Map");

    // **Find Census Layer**
    const censusLayer = state.jimuMapView.view.map.allLayers.find(layer => layer.title === "CensusBlocks2010") as FeatureLayer;
    if (!censusLayer) {
      console.error("❌ Census layer not found!");
      setState({ ...state, errorMessage: "Census layer (CensusBlocks2010) not found.", isLoading: false });
      return;
    }

    // **🚀 Create & Add Each Buffer AND Clip Census Features**
    BUFFER_DISTANCES_METERS.forEach(async (distance, index) => {
      try {
        console.log(`🔄 Creating buffer at ${BUFFER_DISTANCES_MILES[index]} miles (${distance} meters)...`);
        const buffer = geometryEngine.buffer(projectedPoint, distance, "meters");

        if (!buffer || buffer.type !== "polygon") {
          throw new Error(`❌ Buffer creation failed for ${BUFFER_DISTANCES_MILES[index]} miles.`);
        }

        console.log(`✅ Buffer ${BUFFER_DISTANCES_MILES[index]} miles created.`);

        // **Query Census Layer for Intersecting Features**
        const query = censusLayer.createQuery();
        query.geometry = buffer;
        query.spatialRelationship = "intersects";
        query.outFields = ["*"];

        const results = await censusLayer.queryFeatures(query);
        console.log(`📊 Census Features Found in ${BUFFER_DISTANCES_MILES[index]} mile buffer:`, results.features.length);

        results.features.forEach(feature => {
          const clippedFeature = geometryEngine.intersect(feature.geometry, buffer);
          if (clippedFeature) {
            const clippedGraphic = new Graphic({
              geometry: clippedFeature,
              symbol: new SimpleFillSymbol({
                color: BUFFER_COLORS[index], // Color based on buffer index
                outline: { color: [0, 0, 0], width: 1 }
              }),
            });
            bufferLayer.add(clippedGraphic);
          }
        });

        console.log(`✅ Clipped Census Features Added for ${BUFFER_DISTANCES_MILES[index]} miles.`);
      } catch (error) {
        console.error(`❌ Error processing buffer ${BUFFER_DISTANCES_MILES[index]} miles:`, error);
      }
    });

    setState({ ...state, isLoading: false });
  };

  return <div> {/* UI remains unchanged */} </div>;
};

export default Widget;
