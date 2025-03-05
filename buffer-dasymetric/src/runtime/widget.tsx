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

    let bufferLayer = state.jimuMapView.view.map.findLayerById("buffer-layer") as GraphicsLayer;
    if (!bufferLayer) {
      bufferLayer = new GraphicsLayer({ id: "buffer-layer" });
      state.jimuMapView.view.map.add(bufferLayer);
    }
    bufferLayer.removeAll(); // Clear previous graphics

    const censusLayer = state.jimuMapView.view.map.allLayers.find(layer => layer.title === "CensusBlocks2010") as FeatureLayer;
    if (!censusLayer) {
      console.error("❌ Census layer not found!");
      setState({ ...state, errorMessage: "Census layer (CensusBlocks2010) not found.", isLoading: false });
      return;
    }

    BUFFER_DISTANCES_METERS.forEach(async (distance, index) => {
      try {
        console.log(`🔄 Creating buffer at ${BUFFER_DISTANCES_MILES[index]} miles (${distance} meters)...`);
        const buffer = geometryEngine.buffer(projectedPoint, distance, "meters");

        if (!buffer || buffer.type !== "polygon") {
          throw new Error(`❌ Buffer creation failed for ${BUFFER_DISTANCES_MILES[index]} miles.`);
        }

        console.log(`✅ Buffer ${BUFFER_DISTANCES_MILES[index]} miles created.`);

        const query = censusLayer.createQuery();
        query.geometry = buffer;
        query.spatialRelationship = "intersects";
        query.outFields = ["TOTALPOP", "ACRES"];

        const results = await censusLayer.queryFeatures(query);
        console.log(`📊 Census Features Found in ${BUFFER_DISTANCES_MILES[index]} mile buffer:`, results.features.length);

        results.features.forEach(feature => {
          const clippedFeature = geometryEngine.intersect(feature.geometry, buffer);
          if (clippedFeature) {
            const originalAcres = feature.attributes.ACRES;
            const clippedAcres = geometryEngine.geodesicArea(clippedFeature, "acres");
            const ratio = clippedAcres / originalAcres;
            const adjPop = Math.round(ratio * feature.attributes.TOTALPOP);

            const clippedGraphic = new Graphic({
              geometry: clippedFeature,
              attributes: {
                ACRES2: clippedAcres.toFixed(2),
                PCT_ACRES: (ratio * 100).toFixed(2) + "%",
                ADJ_POP: adjPop,
              },
              symbol: new SimpleFillSymbol({
                color: BUFFER_COLORS[index],
                outline: { color: [0, 0, 0], width: 1 }
              }),
              popupTemplate: {
                title: `Census Block Data`,
                content: `
                  <b>Original Acres:</b> ${feature.attributes.ACRES} <br>
                  <b>Clipped Acres (ACRES2):</b> ${clippedAcres.toFixed(2)} <br>
                  <b>Percentage Retained:</b> ${(ratio * 100).toFixed(2)}% <br>
                  <b>Adjusted Population (ADJ_POP):</b> ${adjPop}
                `
              }
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

  return (
    <div>
      <h1>Dasymetric Population Tool</h1>
      <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />
      <TextInput placeholder="Latitude" onChange={(e) => setState({ ...state, latitude: e.target.value })} />
      <TextInput placeholder="Longitude" onChange={(e) => setState({ ...state, longitude: e.target.value })} />
      <Button onClick={processPoint}>Process</Button>
    </div>
  );
};

export default Widget;
