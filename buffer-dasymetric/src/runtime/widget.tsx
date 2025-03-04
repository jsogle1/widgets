import { React, type AllWidgetProps } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import projection from '@arcgis/core/geometry/projection';
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
  // Initialize state
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null,
    isLoading: false,
    bufferResults: [],
  });

  // Handler for when the map view is initialized or changed
  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log('Map view received:', jmv ? 'Valid' : 'Null');
    if (!jmv) {
      console.error('No map view available. Check Map widget ID (widget_6).');
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
    jmv.view.when(() => {
      console.log('Map view loaded, spatial reference:', jmv.view.spatialReference.wkid);
    }).catch((err) => {
      console.error('Map view failed to load:', err);
      setState({ ...state, errorMessage: 'Failed to load map view: ' + err.message });
    });
  };

  // Process the input point and perform buffering
  const processPoint = async (point: Point) => {
    if (!state.jimuMapView) {
      setState({ ...state, errorMessage: 'Map view not loaded. Add a Map widget.' });
      return;
    }
    if (!state.siteName.trim()) {
      setState({ ...state, errorMessage: 'Please enter a site name.' });
      return;
    }

    setState({ ...state, isLoading: true, errorMessage: null });
    const bufferDistances = props.config?.bufferDistances || [0.25, 0.5, 1, 2, 3, 4];
    const censusLayer = state.jimuMapView.view.map.allLayers.find(
      (layer) => layer.title === 'CensusBlocks2010'
    ) as FeatureLayer;

    if (!censusLayer) {
      setState({
        ...state,
        errorMessage: 'Census layer (CensusBlocks2010) not found in the map.',
        isLoading: false,
      });
      return;
    }

    let buffers: __esri.Geometry[];
    try {
      // Load the projection engine
      await projection.load();
      console.log('Projection engine loaded successfully');

      // Project the point to the map's spatial reference
      const mapSR = state.jimuMapView.view.spatialReference;
      let projectedPoint: Point;
      try {
        projectedPoint = projection.project(point, mapSR) as Point;
        console.log('Point projected to map spatial reference:', projectedPoint);
      } catch (projError) {
        console.error('Projection failed:', projError);
        setState({
          ...state,
          errorMessage: 'Failed to project point to map spatial reference.',
          isLoading: false,
        });
        return;
      }

      // Validate the projected point
      if (!projectedPoint || !projectedPoint.spatialReference) {
        throw new Error('Projected point is invalid or missing spatial reference.');
      }

      // Create buffers in meters
      buffers = bufferDistances.map((distance) => {
        const buffer = geometryEngine.buffer(projectedPoint, distance * MILES_TO_METERS, 'meters');
        if (!buffer) {
          console.error('Failed to create buffer for distance:', distance);
        }
        return buffer;
      }).filter((buffer) => buffer && buffer.spatialReference); // Filter out invalid buffers

      if (buffers.length === 0) {
        throw new Error('No valid buffers were created.');
      }
      console.log('Buffers created:', buffers);
    } catch (error) {
      console.error('Error in projection or buffering:', error);
      setState({
        ...state,
        errorMessage: `Error processing data: ${error.message}`,
        isLoading: false,
      });
      return;
    }

    // Query the census layer with the largest buffer
    const query = censusLayer.createQuery();
    query.geometry = buffers[buffers.length - 1];
    query.outFields = ['TOTALPOP', 'ACRES'];

    try {
      const result = await censusLayer.queryFeatures(query);
      if (!result.features.length) {
        setState({
          ...state,
          errorMessage: 'No census features found within the largest buffer.',
          isLoading: false,
        });
        return;
      }

      // Calculate buffer results using intersection
      const bufferResults = bufferDistances.map((distance, index) => {
        const clippedFeatures = result.features.filter((feature) => {
          if (!feature.geometry || !feature.geometry.spatialReference) {
            console.warn('Skipping feature with invalid geometry:', feature);
            return false;
          }
          if (!buffers[index] || !buffers[index].spatialReference) {
            console.warn('Skipping invalid buffer at index:', index);
            return false;
          }
          return geometryEngine.intersects(buffers[index], feature.geometry);
        });

        const totalPop = clippedFeatures.reduce(
          (sum, feature) => sum + (feature.attributes?.TOTALPOP || 0),
          0
        );
        const totalAcres = clippedFeatures.reduce(
          (sum, feature) => sum + (feature.attributes?.ACRES || 0),
          0
        );
        const popDensity = totalPop > 0 && totalAcres > 0 ? totalPop / totalAcres : 0;

        return {
          Distance: distance,
          Features: clippedFeatures.length,
          Population: totalPop,
          Clip_Pop: totalPop,
          Clip_Area: totalAcres,
          POP_DEN: popDensity,
        };
      });

      setState({ ...state, isLoading: false, errorMessage: null, bufferResults });
      console.log('Buffer analysis completed:', bufferResults);

      // Export results to CSV
      const csvData = Papa.unparse(bufferResults, { header: true });
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8' });
      saveAs(blob, `${state.siteName}_buffer_results.csv`);
    } catch (error) {
      console.error('Buffer processing error:', error);
      setState({
        ...state,
        errorMessage: `Error processing data: ${error.message}`,
        isLoading: false,
      });
    }
  };

  // Handle coordinate submission from the UI
  const handleCoordinateSubmit = async () => {
    const { latitude, longitude } = state;

    if (!latitude.trim() || !longitude.trim()) {
      setState({ ...state, errorMessage: 'Please enter both latitude and longitude.' });
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setState({
        ...state,
        errorMessage: 'Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180.',
      });
      return;
    }

    const point = new Point({
      latitude: lat,
      longitude: lon,
      spatialReference: { wkid: 4326 }, // WGS84
    });

    await processPoint(point);
  };

  // Render the widget UI
  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent
        useMapWidgetId="widget_6" // Hardcoded Map widget ID; adjust as needed
        onActiveViewChange={activeViewChangeHandler}
      />

      <div style={{ marginTop: '10px' }}>
        <h4>Enter Coordinates and Site Name</h4>
        <TextInput
          placeholder="Latitude (e.g., 34.0522)"
          value={state.latitude}
          onChange={(e) => setState({ ...state, latitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          placeholder="Longitude (e.g., -118.2437)"
          value={state.longitude}
          onChange={(e) => setState({ ...state, longitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          placeholder="Site Name (e.g., Site A)"
          value={state.siteName}
          onChange={(e) => setState({ ...state, siteName: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <Button onClick={handleCoordinateSubmit} disabled={state.isLoading}>
          {state.isLoading ? 'Processing...' : 'Buffer Coordinates'}
        </Button>
      </div>

      {state.errorMessage && (
        <Alert
          type="error"
          text={state.errorMessage}
          withIcon={true}
          closable={true}
          onClose={() => setState({ ...state, errorMessage: null })}
          style={{ marginTop: '10px' }}
        />
      )}

      {state.isLoading && <div style={{ marginTop: '10px' }}>Analyzing data...</div>}

      {state.bufferResults.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <h4>Buffer Results</h4>
          <ul>
            {state.bufferResults.map((result, index) => (
              <li key={index}>
                {result.Distance} miles: {result.Features} features, Population: {result.Population},
                Adjusted Population: {result.Clip_Pop}, Adjusted Area: {result.Clip_Area} acres,
                Density: {result.POP_DEN.toFixed(2)} people/acre
              </li>
            ))}
          </ul>
          <p>CSV exported as {state.siteName}_buffer_results.csv</p>
        </div>
      )}
    </div>
  );
};

export default Widget;
