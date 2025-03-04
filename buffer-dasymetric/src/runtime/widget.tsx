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
    if (!jmv) {
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
  };

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
      await projection.load();
      const mapSR = state.jimuMapView.view.spatialReference;
      let projectedPoint: Point;
      try {
        projectedPoint = projection.project(point, mapSR) as Point;
      } catch (projError) {
        setState({
          ...state,
          errorMessage: 'Failed to project point to map spatial reference.',
          isLoading: false,
        });
        return;
      }

      if (!projectedPoint || !projectedPoint.spatialReference) {
        throw new Error('Projected point is invalid or missing spatial reference.');
      }

      buffers = bufferDistances.map((distance) => {
        const buffer = geometryEngine.buffer(projectedPoint, distance * MILES_TO_METERS, 'meters');
        return buffer ? (Array.isArray(buffer) ? buffer : [buffer]) : null;
      }).flat().filter((buffer): buffer is __esri.Geometry => !!buffer);

      if (buffers.length === 0) {
        throw new Error('No valid buffers were created.');
      }
    } catch (error) {
      setState({
        ...state,
        errorMessage: `Error processing data: ${error.message}`,
        isLoading: false,
      });
      return;
    }

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

      const bufferResults = bufferDistances.map((distance, index) => {
        const clippedFeatures = result.features.filter((feature) => 
          buffers[index] && feature.geometry && geometryEngine.intersects(buffers[index], feature.geometry)
        );

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

      const csvData = Papa.unparse(bufferResults, { header: true });
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8' });
      saveAs(blob, `${state.siteName}_buffer_results.csv`);
    } catch (error) {
      setState({
        ...state,
        errorMessage: `Error processing data: ${error.message}`,
        isLoading: false,
      });
    }
  };

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
      spatialReference: { wkid: 4326 },
    });

    await processPoint(point);
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent
        useMapWidgetId="widget_6"
        onActiveViewChange={activeViewChangeHandler}
      />

      <div style={{ marginTop: '10px' }}>
        <h4>Enter Coordinates and Site Name</h4>
        <TextInput
          placeholder="Latitude"
          value={state.latitude}
          onChange={(e) => setState({ ...state, latitude: e.target.value })}
          style={{ width: '150px' }}
        />
        <TextInput
          placeholder="Longitude"
          value={state.longitude}
          onChange={(e) => setState({ ...state, longitude: e.target.value })}
          style={{ width: '150px' }}
        />
        <TextInput
          placeholder="Site Name"
          value={state.siteName}
          onChange={(e) => setState({ ...state, siteName: e.target.value })}
          style={{ width: '150px' }}
        />
        <Button onClick={handleCoordinateSubmit} disabled={state.isLoading}>
          {state.isLoading ? 'Processing...' : 'Buffer Coordinates'}
        </Button>
      </div>

      {state.errorMessage && (
        <Alert
          type="error"
          text={state.errorMessage}
          withIcon
          closable
          onClose={() => setState({ ...state, errorMessage: null })}
          style={{ marginTop: '10px' }}
        />
      )}
    </div>
  );
};

export default Widget;
