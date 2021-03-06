import React from 'react';
import Reflux from 'reflux';
import {Link} from 'react-router';

import ApiMixin from '../mixins/apiMixin';
import IndicatorStore from '../stores/indicatorStore';
import TimeSince from './timeSince';
import DropdownLink from './dropdownLink';
import GroupChart from './stream/groupChart';
import GroupStore from '../stores/groupStore';
import Modal from 'react-bootstrap/lib/Modal';
import {t} from '../locale';

const Snooze = {
  // all values in minutes
  '30MINUTES': 30,
  '2HOURS': 60 * 2,
  '24HOURS': 60 * 24,
};


const SnoozeAction = React.createClass({
  getInitialState() {
    return {
      isModalOpen: false
    };
  },

  toggleModal() {
    if (this.props.disabled) {
      return;
    }
    this.setState({
      isModalOpen: !this.state.isModalOpen
    });
  },

  closeModal() {
    this.setState({isModalOpen: false});
  },

  onSnooze(duration) {
    this.props.onSnooze(duration);
    this.closeModal();
  },

  render(){
    return (
      <a title={this.props.tooltip}
         className={this.props.className}
         disabled={this.props.disabled}
         onClick={this.toggleModal}>
        <span>zZz</span>

        <Modal show={this.state.isModalOpen} title={t('Please confirm')} animation={false}
               onHide={this.closeModal} bsSize="sm">
          <div className="modal-body">
            <h5>How long should we snooze this issue?</h5>
            <ul className="nav nav-stacked nav-pills">
              <li><a onClick={this.onSnooze.bind(this, Snooze['30MINUTES'])}>30 minutes</a></li>
              <li><a onClick={this.onSnooze.bind(this, Snooze['2HOURS'])}>2 hours</a></li>
              <li><a onClick={this.onSnooze.bind(this, Snooze['24HOURS'])}>24 hours</a></li>
              <li><a onClick={this.onSnooze}>Forever</a></li>
            </ul>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-default"
                    onClick={this.closeModal}>{t('Cancel')}</button>
          </div>
        </Modal>
      </a>
    );
  }
});

const CompactIssue = React.createClass({
  propTypes: {
    id: React.PropTypes.string.isRequired,
  },

  mixins: [
    ApiMixin,
    Reflux.listenTo(GroupStore, 'onGroupChange')
  ],

  getInitialState() {
    return {
      issue: GroupStore.get(this.props.id)
    };
  },

  componentWillReceiveProps(nextProps) {
    if (nextProps.id != this.props.id) {
      this.setState({
        issue: GroupStore.get(this.props.id)
      });
    }
  },

  onGroupChange(itemIds) {
    if (!itemIds.has(this.props.id)) {
      return;
    }
    let id = this.props.id;
    let issue = GroupStore.get(id);
    this.setState({
      issue: issue,
    });
  },

  onSnooze(duration) {
    this.onUpdate({
      status: 'muted',
      snoozeDuration: duration,
    });
  },

  onUpdate(data) {
    let issue = this.state.issue;
    let loadingIndicator = IndicatorStore.add(t('Saving changes..'));

    this.api.bulkUpdate({
      orgId: this.props.orgId,
      projectId: issue.project.slug,
      itemIds: [issue.id],
        data: data,
    }, {
      complete: () => {
        IndicatorStore.remove(loadingIndicator);
      }
    });
  },

  render() {
    let issue = this.state.issue;

    let className = 'issue row';
    if (issue.isBookmarked) {
      className += ' isBookmarked';
    }
    if (issue.hasSeen) {
      className += ' hasSeen';
    }
    if (issue.status === 'resolved') {
      className += ' isResolved';
    }
    if (issue.status === 'muted') {
      className += ' isMuted';
    }

    className += ' level-' + issue.level;

    let {id, orgId} = this.props;
    let projectId = issue.project.slug;

    let title = <span className="icon-more"></span>;

    return (
      <li className={className} onClick={this.toggleSelect}>
        <div className="col-md-9">
          <span className="error-level truncate" title={issue.level}></span>
          <h3 className="truncate">
            <Link to={`/${orgId}/${projectId}/issues/${id}/`}>
              <span className="icon icon-soundoff" />
              <span className="icon icon-bookmark" />
              {issue.title}
            </Link>
          </h3>
          <div className="event-extra">
            <ul>
              <li className="project-name">
                <Link to={`/${orgId}/${projectId}/`}>{issue.project.name}</Link>
              </li>
              <li className="hidden">
                <span className="icon icon-clock" />
                <TimeSince date={issue.lastSeen} />
                &nbsp;&mdash;&nbsp;
                <TimeSince date={issue.firstSeen} suffix="old" />
              </li>
              {issue.numComments !== 0 &&
                <li>
                  <Link to={`/${orgId}/${projectId}/issues/${id}/activity/`} className="comments">
                    <span className="icon icon-comments" />
                    <span className="tag-count">{issue.numComments}</span>
                  </Link>
                </li>
              }
              <li className="culprit">{issue.culprit}</li>
            </ul>
          </div>
        </div>
        {this.props.statsPeriod &&
          <div className="col-md-2 hidden-sm hidden-xs event-graph align-right">
            <GroupChart id={id} statsPeriod={this.props.statsPeriod} />
          </div>
        }
        <div className="col-md-1 align-right">
          <DropdownLink
            topLevelClasses="more-menu"
            className="more-menu-toggle"
            caret={false}
            title={title}>
            <li>
              <a onClick={this.onUpdate.bind(this, {status: issue.status !== 'resolved' ? 'resolved' : 'unresolved'})}>
                <span className="icon-checkmark" />
              </a>
            </li>
            <li>
              <a onClick={this.onUpdate.bind(this, {isBookmarked: !issue.isBookmarked})}>
                <span className="icon-bookmark" />
              </a>
            </li>
            <li>
              <SnoozeAction
                orgId={orgId}
                projectId={projectId}
                groupId={id}
                onSnooze={this.onSnooze} />
            </li>
            {false &&
              <li><a href="#"><span className="icon-user" /></a></li>
            }
          </DropdownLink>
        </div>
      </li>
    );
  }
});

export default CompactIssue;
