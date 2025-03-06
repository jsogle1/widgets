import { React, type AllWidgetProps } from 'jimu-core'; 
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import * as projection from '@arcgis/core/geometry/projection';
import { TextInput, Button, Alert } from 'jimu-ui';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import Query from '@arcgis/core/rest/support/Query';

// Convert miles to meters (1 mile = 1609.34 meters)
const BUFFER_DISTANCES_MILES = [0.25, 0.5, 1, 2, 3, 4, 5];
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
    siteName: '',
    errorMessage: null as string | null,
    isLoading: false,
  });

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (!jmv) {
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
  };

  const processPoint = async () => {
    const { latitude, longitude, siteName } = state;

    if (!latitude.trim() || !longitude.trim() || !siteName.trim()) {
      setState({ ...state, errorMessage: "Enter Latitude, Longitude, and Site Name." });
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setState({ ...state, errorMessage: "Invalid coordinates." });
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
    if (!state.jimuMapView) {
      setState({ ...state, errorMessage: "Map view not loaded." });
      return;
    }

    setState({ ...state, isLoading: true, errorMessage: null });
    await projection.load();

    const mapSR = state.jimuMapView.view.spatialReference;
    const projectedPoint = projection.project(point, mapSR) as Point;
    if (!projectedPoint) {
      setState({ ...state, errorMessage: "Projection failed.", isLoading: false });
      return;
    }

    let bufferLayer = state.jimuMapView.view.map.findLayerById("buffer-layer") as GraphicsLayer;
    if (!bufferLayer) {
      bufferLayer = new GraphicsLayer({ id: "buffer-layer" });
      state.jimuMapView.view.map.add(bufferLayer);
    }
    bufferLayer.removeAll();

    const censusLayer = state.jimuMapView.view.map.allLayers.find(layer => layer.title === "CensusBlocks2010") as FeatureLayer;
    if (!censusLayer) {
      setState({ ...state, errorMessage: "Census layer not found.", isLoading: false });
      return;
    }

    let summaryStats: { [key: string]: number } = {
      "¼-½ mile": 0, "½-1 mile": 0, "1-2 miles": 0, "2-3 miles": 0, "3-4 miles": 0, "4-5 miles": 0
    };

    BUFFER_DISTANCES_METERS.forEach(async (distance, index) => {
      try {
        const buffer = geometryEngine.buffer(projectedPoint, distance, "meters");
        if (!buffer) {
          console.error(`❌ Buffer creation failed for ${BUFFER_DISTANCES_MILES[index]} miles.`);
          return;
        }

        const query = censusLayer.createQuery();
        query.geometry = buffer;
        query.spatialRelationship = "intersects";
        query.outFields = ["TOTALPOP", "ACRES"];

        const results = await censusLayer.queryFeatures(query);
        console.log(`📊 Census Features Found in ${BUFFER_DISTANCES_MILES[index]} mile buffer:`, results.features.length);

        results.features.forEach(feature => {
          const clippedFeature = geometryEngine.intersect(feature.geometry, buffer);
          if (!clippedFeature) {
            console.warn(`⚠ No clipped geometry for feature in buffer ${BUFFER_DISTANCES_MILES[index]} miles.`);
            return;
          }

          let originalAcres = feature.attributes.ACRES;
          let clippedAcres = geometryEngine.geodesicArea(clippedFeature, "acres");

          // 🚨 **Fix: Prevent Clipped Acres from Exceeding Original Acres**
          if (clippedAcres > originalAcres) {
            console.warn(`⚠ Clipped Acres (${clippedAcres.toFixed(4)}) > Original Acres (${originalAcres.toFixed(4)}) - Adjusting.`);
            clippedAcres = originalAcres;
          }

          // 🚨 **Fix: Ensure Original Acres is Valid Before Division**
          if (!originalAcres || originalAcres <= 0) {
            console.warn(`⚠ Original Acres is invalid (${originalAcres}), skipping calculation.`);
            return;
          }

          // ✅ **Calculate the ratio AFTER fixing float issues**
          const ratio = clippedAcres / originalAcres;
          const adjPop = Math.round(ratio * feature.attributes.TOTALPOP);

          console.log(`✅ ACRES2: ${clippedAcres.toFixed(4)}, Ratio: ${ratio.toFixed(4)}, ADJ_POP: ${adjPop}`);

          // Create Graphic with Fixed Values
          const clippedGraphic = new Graphic({
            geometry: clippedFeature,
            attributes: {
              ACRES2: clippedAcres.toFixed(4),
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
                <b>Clipped Acres (ACRES2):</b> ${clippedAcres.toFixed(4)} <br>
                <b>Percentage Retained:</b> ${(ratio * 100).toFixed(2)}% <br>
                <b>Adjusted Population (ADJ_POP):</b> ${adjPop}
              `
            }
          });

          bufferLayer.add(clippedGraphic);
        });
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
      <TextInput placeholder="Site Name" onChange={(e) => setState({ ...state, siteName: e.target.value })} />
      <TextInput placeholder="Latitude" onChange={(e) => setState({ ...state, latitude: e.target.value })} />
      <TextInput placeholder="Longitude" onChange={(e) => setState({ ...state, longitude: e.target.value })} />
      <Button onClick={processPoint}>Process</Button>
    </div>
  );
};

export default Widget;
