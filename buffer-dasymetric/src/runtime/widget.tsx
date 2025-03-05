
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

    for (let index = 1; index < BUFFER_DISTANCES_METERS.length; index++) {
      const bufferOuter = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index], "meters");
      const bufferInner = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index - 1], "meters");
      if (!bufferOuter || !bufferInner) {
        console.error(`❌ Buffer creation failed for ${BUFFER_DISTANCES_MILES[index]} miles.`);
        continue;
      }

      const ringBuffer = geometryEngine.difference(bufferOuter, bufferInner);
      if (!ringBuffer) {
        console.warn(`⚠ Ring buffer invalid for ${BUFFER_DISTANCES_MILES[index]} miles.`);
        continue;
      }

      const query = censusLayer.createQuery();
      query.geometry = ringBuffer;
      query.spatialRelationship = "intersects";
      query.outFields = ["TOTALPOP", "ACRES"];

      const results = await censusLayer.queryFeatures(query);
      console.log(`📊 Census Features Found in ${BUFFER_DISTANCES_MILES[index - 1]}-${BUFFER_DISTANCES_MILES[index]} mile buffer:`, results.features.length);

      results.features.forEach(feature => {
        const clippedFeature = geometryEngine.intersect(feature.geometry, ringBuffer);
        if (!clippedFeature) {
          console.warn(`⚠ No clipped geometry for feature in buffer ${BUFFER_DISTANCES_MILES[index]} miles.`);
          return;
        }

        let clippedAcres = geometryEngine.geodesicArea(clippedFeature, "acres");
        let originalAcres = feature.attributes.ACRES;

        // 🛠 **Fix: Prevent NaN errors**
        if (isNaN(clippedAcres) || clippedAcres <= 0 || !originalAcres || originalAcres <= 0) {
          console.warn(`⚠ Invalid clipped area detected in buffer ${BUFFER_DISTANCES_MILES[index]} miles. Skipping.`);
          return;
        }

        const ratio = clippedAcres / originalAcres;
        const adjPop = Math.round(ratio * feature.attributes.TOTALPOP);
        summaryStats[`${BUFFER_DISTANCES_MILES[index - 1]}-${BUFFER_DISTANCES_MILES[index]} miles`] += adjPop;

        const clippedGraphic = new Graphic({
          geometry: clippedFeature,
          attributes: { ACRES2: clippedAcres, ADJ_POP: adjPop },
          symbol: new SimpleFillSymbol({ color: [255, 0, 0, 0.4], outline: { color: [0, 0, 0], width: 1 } }),
          popupTemplate: {
            title: `Census Block Data`,
            content: `ACRES2: ${clippedAcres.toFixed(2)}<br> ADJ_POP: ${adjPop}`
          }
        });

        bufferLayer.add(clippedGraphic);
      });
    }

    console.log(`📊 Dasymetric Summary for ${state.siteName}:`, summaryStats);
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
