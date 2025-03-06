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

// ✅ **Standardized Buffer Distances**
const BUFFER_DISTANCES_MILES = [0.25, 0.5, 1, 2, 3, 4];  
const BUFFER_DISTANCES_METERS = BUFFER_DISTANCES_MILES.map(miles => miles * 1609.34);

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
    summaryStats: {} as { [key: string]: number }
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
      "0-0.25 miles": 0, "0.25-0.5 miles": 0, "0.5-1 miles": 0, "1-2 miles": 0, "2-3 miles": 0, "3-4 miles": 0
    };

    let allBufferGeometries: __esri.Geometry[] = [];

    for (let index = 0; index < BUFFER_DISTANCES_METERS.length; index++) {
      const outerBuffer = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index], "meters");
      const innerBuffer = index > 0 ? geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index - 1], "meters") : null;
      const ringBuffer = innerBuffer ? geometryEngine.difference(outerBuffer, innerBuffer) : outerBuffer;
      if (!ringBuffer) continue;

      allBufferGeometries.push(ringBuffer);

      const query = censusLayer.createQuery();
      query.geometry = ringBuffer;
      query.spatialRelationship = "intersects";
      query.outFields = ["TOTALPOP", "ACRES"];

      const results = await censusLayer.queryFeatures(query);
      results.features.forEach(feature => {
        const clippedFeature = geometryEngine.intersect(feature.geometry, ringBuffer);
        if (!clippedFeature) return;

        let originalAcres = feature.attributes?.ACRES;
        let clippedAcres = geometryEngine.geodesicArea(clippedFeature, "acres");
        if (!originalAcres || originalAcres <= 0 || isNaN(originalAcres)) return;

        const ratio = clippedAcres > 0 ? clippedAcres / originalAcres : 0;
        const adjPop = Math.round(ratio * (feature.attributes?.TOTALPOP || 0));

        const ringLabel = `${BUFFER_DISTANCES_MILES[index - 1] || 0}-${BUFFER_DISTANCES_MILES[index]} miles`;
        summaryStats[ringLabel] += adjPop;

        const bufferGraphic = new Graphic({
          geometry: clippedFeature,
          symbol: new SimpleFillSymbol({
            color: BUFFER_COLORS[index],
            outline: { color: [0, 0, 0], width: 1 }
          }),
          attributes: {
            ACRES2: clippedAcres,
            ADJ_POP: adjPop
          },
          popupTemplate: {
            title: `Census Block Data`,
            content: `ACRES2: ${clippedAcres.toFixed(2)}<br> ADJ_POP: ${adjPop}`
          }
        });

        bufferLayer.add(bufferGraphic);
      });
    }

    if (allBufferGeometries.length > 0) {
      const bufferExtent = geometryEngine.union(allBufferGeometries)?.extent;
      if (bufferExtent) {
        state.jimuMapView.view.goTo(bufferExtent, { duration: 1500 }).catch(err => console.error("Zoom error:", err));
      }
    }

    setState({ ...state, isLoading: false, summaryStats });
  };

  return (
  <div className="widget-container" style={{ position: "relative" }}>
    <h1>Dasymetric Population Tool</h1>
    <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />

    <div className="input-container">
      <TextInput placeholder="Site Name" onChange={(e) => setState({ ...state, siteName: e.target.value })} />
      <TextInput placeholder="Latitude" onChange={(e) => setState({ ...state, latitude: e.target.value })} />
      <TextInput placeholder="Longitude" onChange={(e) => setState({ ...state, longitude: e.target.value })} />
      <Button onClick={processPoint}>Process</Button>
    </div>

    {state.errorMessage && <Alert type="error" text={state.errorMessage} />}

    {/* ✅ Move Statistics Box inside the Map */}
    {state.jimuMapView && (
      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "white",
          padding: "10px",
          border: "1px solid black",
          boxShadow: "2px 2px 10px rgba(0,0,0,0.2)",
          zIndex: 10, // Ensures it stays above the map
          opacity: 0.9, // Slight transparency to not obscure map too much
          maxWidth: "220px",
        }}
      >
        <h3>Statistics</h3>
        {Object.entries(state.summaryStats).map(([buffer, adjPop]) => (
          <p key={buffer}><b>{buffer}:</b> {adjPop}</p>
        ))}
      </div>
    )}
  </div>
);

};

export default Widget;
